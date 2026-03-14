-- One-off backfill: copy an approved partner request into an existing store row.
-- Adjust only these 2 values before running:
--   v_request_id      -> id from restaurant_signup_requests
--   v_target_loja_id  -> idloja that should be updated

DO $$
DECLARE
  v_request_id uuid := 'ff9a4df0-c3a7-46a5-bfa9-6208f0707a24';
  v_target_loja_id integer := 3;

  v_request record;
  v_owner_user_id integer;
  v_morada_id integer;
BEGIN
  SELECT *
  INTO v_request
  FROM restaurant_signup_requests
  WHERE id = v_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de parceiro nao encontrado: %', v_request_id;
  END IF;

  IF v_request.status <> 'APPROVED' THEN
    RAISE NOTICE 'Pedido % nao estava APPROVED. Vai ser marcado como APPROVED.', v_request_id;
  END IF;

  BEGIN
    v_owner_user_id := NULLIF(v_request.user_id, '')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    v_owner_user_id := NULL;
  END;

  IF v_owner_user_id IS NULL AND v_request.email IS NOT NULL THEN
    SELECT u.idutilizador
    INTO v_owner_user_id
    FROM utilizadores u
    WHERE lower(u.email) = lower(v_request.email)
    LIMIT 1;
  END IF;

  IF v_request.morada_completa IS NOT NULL THEN
    INSERT INTO moradas (
      morada,
      latitude,
      longitude,
      place_id,
      nome,
      data_criacao
    )
    VALUES (
      v_request.morada_completa,
      v_request.latitude,
      v_request.longitude,
      v_request.place_id,
      v_request.restaurante_nome,
      NOW()
    )
    RETURNING idmorada INTO v_morada_id;
  END IF;

  UPDATE lojas
  SET
    nome = v_request.restaurante_nome,
    contacto = COALESCE(v_request.telefone, contacto),
    nif = v_request.nif,
    morada_completa = v_request.morada_completa,
    horario_funcionamento = v_request.horario_funcionamento,
    latitude = v_request.latitude,
    longitude = v_request.longitude,
    place_id = v_request.place_id,
    idmorada = COALESCE(v_morada_id, idmorada),
    idutilizador = COALESCE(v_owner_user_id, idutilizador),
    ativo = CASE WHEN ativo IS NULL THEN NULL ELSE TRUE END
  WHERE idloja = v_target_loja_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja de destino nao encontrada: %', v_target_loja_id;
  END IF;

  UPDATE restaurant_signup_requests
  SET
    loja_id = v_target_loja_id,
    status = 'APPROVED',
    reviewed_at = COALESCE(reviewed_at, NOW())
  WHERE id = v_request_id;

  IF v_owner_user_id IS NOT NULL THEN
    INSERT INTO utilizadorespermissoes (idutilizador, idpermissao)
    SELECT v_owner_user_id, p.idpermissao
    FROM permissoes p
    WHERE p.permissao ILIKE '%restaur%'
       OR p.permissao ILIKE '%loja%'
       OR p.permissao ILIKE '%merchant%'
    ORDER BY p.idpermissao
    LIMIT 1
    ON CONFLICT (idutilizador, idpermissao) DO NOTHING;

    UPDATE restaurant_staff_access
    SET role = 'OWNER'
    WHERE user_id = v_owner_user_id::text
      AND loja_id = v_target_loja_id;

    IF NOT FOUND THEN
      INSERT INTO restaurant_staff_access (user_id, loja_id, role)
      VALUES (v_owner_user_id::text, v_target_loja_id, 'OWNER');
    END IF;
  END IF;
END
$$;
