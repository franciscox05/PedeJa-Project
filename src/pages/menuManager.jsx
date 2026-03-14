import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchMenus,
  createMenu,
  updateMenu,
  deleteMenu,
  toggleDisponivel,
  uploadMenuImage,
} from "../services/menuManagerService";
import { resolveRestaurantStoreId } from "../services/opsDashboardService";
import { supabase } from "../services/supabaseClient";
import { extractRestaurantId, isAdmin } from "../utils/roles";
import "../css/pages/dashboard.css";

const EMPTY_FORM = {
  nome: "",
  desc: "",
  preco: "",
  ativo: true,
  imagem: "",
  idtipomenu: "",
};

function formatCurrency(value) {
  return `${Number(value || 0).toFixed(2)}EUR`;
}

function sanitizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const STORE_MENU_CATEGORY_PREFIX = "__store_menu__";

function parseCategoryValue(value) {
  const raw = String(value || "");

  if (!raw) return { kind: "empty", id: null };

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return { kind: "id", id: numeric };
  }

  return { kind: "empty", id: null };
}

function parseScopedMenuCategory(rawName) {
  const raw = String(rawName || "").trim();

  if (!raw.startsWith(STORE_MENU_CATEGORY_PREFIX)) {
    return { scoped: false, storeId: null, label: raw };
  }

  const rest = raw.slice(STORE_MENU_CATEGORY_PREFIX.length);
  const separator = rest.indexOf("::");

  if (separator < 0) {
    return { scoped: false, storeId: null, label: raw };
  }

  const storeId = Number(rest.slice(0, separator));
  const label = rest.slice(separator + 2).trim();

  if (!Number.isFinite(storeId) || !label) {
    return { scoped: false, storeId: null, label: raw };
  }

  return { scoped: true, storeId, label };
}

function buildScopedMenuCategory(storeId, label) {
  return `${STORE_MENU_CATEGORY_PREFIX}${Number(storeId)}::${String(label || "").trim()}`;
}

function displayMenuCategoryLabel(rawName) {
  return parseScopedMenuCategory(rawName).label || String(rawName || "").trim();
}

function sortCategoryOptions(list = []) {
  return [...list].sort((a, b) =>
    String(a?.label || "").localeCompare(String(b?.label || ""), "pt", { sensitivity: "base" }),
  );
}

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function mergeTiposMenu(current = [], nextItem = null) {
  const map = new Map();

  [...(current || []), ...(nextItem ? [nextItem] : [])].forEach((item) => {
    const key = String(item?.idtipomenu || "");
    if (!key) return;
    map.set(key, item);
  });

  return [...map.values()].sort((a, b) =>
    String(a?.tipomenu || "").localeCompare(String(b?.tipomenu || ""), "pt", { sensitivity: "base" }),
  );
}

export default function MenuManager() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const formPanelRef = useRef(null);

  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const admin = isAdmin(user);

  const roleStoreId = extractRestaurantId(user) || "";
  const queryStoreId = searchParams.get("loja") || "";
  const initialStoreId = admin ? (queryStoreId || roleStoreId || "") : roleStoreId;

  const [fixedStoreId, setFixedStoreId] = useState(roleStoreId || "");
  const [lojaId, setLojaId] = useState(initialStoreId);
  const [adminStores, setAdminStores] = useState([]);
  const [adminStoreSearch, setAdminStoreSearch] = useState("");
  const [menus, setMenus] = useState([]);
  const [tiposMenu, setTiposMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("RECENT");
  const [storeName, setStoreName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryActionId, setCategoryActionId] = useState("");
  const [categoryEditId, setCategoryEditId] = useState("");
  const [categoryEditName, setCategoryEditName] = useState("");
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  useEffect(() => {
    let active = true;

    const bootstrapStore = async () => {
      if (roleStoreId) {
        if (active) {
          setFixedStoreId(String(roleStoreId));
          if (!admin) setLojaId(String(roleStoreId));
        }
        return;
      }

      const resolvedStore = await resolveRestaurantStoreId(user);
      if (active && resolvedStore) {
        setFixedStoreId(String(resolvedStore));
        if (!admin) setLojaId(String(resolvedStore));
      }
    };

    bootstrapStore();

    return () => {
      active = false;
    };
  }, [admin, roleStoreId, user, userRaw]);

  useEffect(() => {
    if (admin && queryStoreId) {
      setLojaId(String(queryStoreId));
    }
  }, [admin, queryStoreId]);

  const filteredAdminStores = useMemo(() => {
    const search = sanitizeSearch(adminStoreSearch);
    if (!search) return adminStores;
    return (adminStores || []).filter((store) => sanitizeSearch(store.nome).includes(search));
  }, [adminStoreSearch, adminStores]);

  useEffect(() => {
    if (!admin) return;
    if (!adminStores.length) return;
    if (!filteredAdminStores.length) return;

    const existsInFiltered = filteredAdminStores.some((store) => String(store.idloja) === String(lojaId));

    if (!lojaId || !existsInFiltered) {
      setLojaId(String(filteredAdminStores[0].idloja));
    }
  }, [admin, adminStores, filteredAdminStores, lojaId]);

  const scopedLoja = admin ? lojaId : fixedStoreId;

  useEffect(() => {
    let active = true;

    const loadStoreIdentity = async () => {
      if (!scopedLoja) {
        if (active) setStoreName("");
        return;
      }

      const { data, error: storeError } = await supabase
        .from("lojas")
        .select("idloja, nome")
        .eq("idloja", Number(scopedLoja))
        .maybeSingle();

      if (!active) return;
      if (storeError) {
        setStoreName("");
        return;
      }

      setStoreName(data?.nome || "");
    };

    loadStoreIdentity();
    return () => {
      active = false;
    };
  }, [scopedLoja]);

  const loadAdminStores = async () => {
    if (!admin) {
      setAdminStores([]);
      return;
    }

    const { data, error: storeError } = await supabase
      .from("lojas")
      .select("idloja, nome")
      .order("idloja", { ascending: true });

    if (storeError) {
      setAdminStores([]);
      return;
    }

    const stores = data || [];
    setAdminStores(stores);

    setLojaId((prev) => {
      if (queryStoreId && stores.some((store) => String(store.idloja) === String(queryStoreId))) {
        return String(queryStoreId);
      }

      if (prev && stores.some((store) => String(store.idloja) === String(prev))) {
        return String(prev);
      }

      return stores.length > 0 ? String(stores[0].idloja) : "";
    });
  };
  const loadTiposMenu = async () => {
    const { data, error: tiposError } = await supabase
      .from("tiposmenu")
      .select("idtipomenu, tipomenu")
      .order("idtipomenu", { ascending: true });

    if (tiposError) {
      setTiposMenu([]);
      return;
    }

    setTiposMenu(data || []);
  };

  const loadMenus = async () => {
    if (!scopedLoja) {
      setError("Sem loja associada a esta conta.");
      setLoading(false);
      setMenus([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await fetchMenus(scopedLoja);
      setMenus(data);
    } catch (err) {
      setError(err.message || "Falha ao carregar menu.");
      setMenus([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  useEffect(() => {
    loadTiposMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMenus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedLoja]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImageFile(null);
    setEditingId(null);
  };

  const scrollToForm = () => {
    formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };


  const handleLogout = () => {
    localStorage.removeItem("pedeja_user");
    localStorage.removeItem("pedeja_cart");
    navigate("/", { replace: true });
  };

  const goToWebsite = () => {
    navigate("/");
  };

  const ensureScopedTipoMenuIdByLabel = async (categoryName) => {
    const cleanName = String(categoryName || "").trim();
    const normalizedStoreId = Number(scopedLoja);

    if (!cleanName || !Number.isFinite(normalizedStoreId)) {
      throw new Error("Sem loja ativa para gerir categorias.");
    }

    const existingOption = (storeCategoryOptions || []).find(
      (option) => normalizeText(option.label) === normalizeText(cleanName),
    );

    const parsedExisting = parseCategoryValue(existingOption?.value);
    if (parsedExisting.kind === "id" && Number.isFinite(parsedExisting.id)) {
      return Number(parsedExisting.id);
    }

    const existingScoped = (tiposMenu || []).find((item) => {
      const parsed = parseScopedMenuCategory(item?.tipomenu);
      return parsed.scoped
        && parsed.storeId === normalizedStoreId
        && normalizeText(parsed.label) === normalizeText(cleanName);
    });

    if (existingScoped?.idtipomenu) {
      return Number(existingScoped.idtipomenu);
    }

    const encodedName = buildScopedMenuCategory(normalizedStoreId, cleanName);

    const { data, error: insertError } = await supabase
      .from("tiposmenu")
      .insert({ tipomenu: encodedName })
      .select("idtipomenu, tipomenu")
      .single();

    if (insertError) throw insertError;

    if (data?.idtipomenu) {
      setTiposMenu((prev) => mergeTiposMenu(prev, data));
      return Number(data.idtipomenu);
    }

    return null;
  };

  const resolveFormCategoryToTipoId = async (rawValue) => {
    const parsed = parseCategoryValue(rawValue);

    if (parsed.kind === "id" && Number.isFinite(parsed.id)) {
      return Number(parsed.id);
    }

    return null;
  };

  const validateForm = () => {
    const nome = String(form.nome || "").trim();
    const preco = Number(String(form.preco || "").replace(",", "."));

    if (!scopedLoja) {
      return "Define a loja antes de criar um prato.";
    }

    if (nome.length < 2) {
      return "O nome do prato deve ter pelo menos 2 caracteres.";
    }

    if (!Number.isFinite(preco) || preco < 0) {
      return "Preco invalido. Usa um valor igual ou superior a 0.";
    }

    if (String(form.desc || "").length > 700) {
      return "Descricao demasiado longa (maximo 700 caracteres).";
    }

    if (imageFile && !String(imageFile.type || "").startsWith("image/")) {
      return "O ficheiro selecionado nao e uma imagem valida.";
    }

    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      let imageUrl = form.imagem;
      if (imageFile) {
        imageUrl = await uploadMenuImage(imageFile, scopedLoja);
      }

      const resolvedTipoId = await resolveFormCategoryToTipoId(form.idtipomenu);

      const payload = {
        ...form,
        idtipomenu: resolvedTipoId ? String(resolvedTipoId) : "",
        imagem: imageUrl,
      };

      if (editingId) {
        await updateMenu(scopedLoja, editingId, payload);
      } else {
        await createMenu(scopedLoja, payload);
      }

      resetForm();
      await loadMenus();
    } catch (err) {
      setError(err.message || "Erro ao gravar prato.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.idmenu);
    setForm({
      nome: item.nome || "",
      desc: item.desc || "",
      preco: item.preco ?? "",
      ativo: item.ativo !== false,
      imagem: item.imagem || "",
      idtipomenu: item.idtipomenu ? String(item.idtipomenu) : "",
    });
    setImageFile(null);
    scrollToForm();
  };

  const handleDelete = async (idmenu, nome) => {
    if (!confirm(`Apagar o prato \"${nome || "sem nome"}\"?`)) return;

    setSaving(true);
    setError("");

    try {
      await deleteMenu(scopedLoja, idmenu);
      if (editingId === idmenu) resetForm();
      await loadMenus();
    } catch (err) {
      setError(err.message || "Erro ao apagar prato.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item) => {
    setError("");

    try {
      await toggleDisponivel(scopedLoja, item.idmenu, !(item.ativo !== false));
      await loadMenus();
    } catch (err) {
      setError(err.message || "Erro ao alterar disponibilidade.");
    }
  };

  const handleCreateCategory = async () => {
    const cleanName = String(newCategoryName || "").trim();

    if (cleanName.length < 2) {
      setError("A categoria precisa de pelo menos 2 caracteres.");
      return;
    }

    if (!scopedLoja) {
      setError("Sem loja ativa para criar categoria.");
      return;
    }

    setCreatingCategory(true);
    setError("");

    try {
      const idtipomenu = await ensureScopedTipoMenuIdByLabel(cleanName);
      if (idtipomenu) {
        setForm((prev) => ({ ...prev, idtipomenu: String(idtipomenu) }));
      }
      setNewCategoryName("");
      await loadTiposMenu();
    } catch (err) {
      setError(err.message || "Nao foi possivel criar categoria.");
    } finally {
      setCreatingCategory(false);
    }
  };

  const startCategoryEdit = (option) => {
    setCategoryEditId(String(option.value));
    setCategoryEditName(option.label || "");
  };

  const cancelCategoryEdit = () => {
    setCategoryEditId("");
    setCategoryEditName("");
  };

  const handleSaveCategory = async (categoryValue) => {
    const sourceOption = (storeCategoryOptions || []).find(
      (item) => String(item.value) === String(categoryValue),
    );

    if (!sourceOption) {
      setError("Categoria invalida.");
      return;
    }

    const cleanName = String(categoryEditName || "").trim();
    if (cleanName.length < 2) {
      setError("O nome da categoria deve ter pelo menos 2 caracteres.");
      return;
    }

    const duplicated = (storeCategoryOptions || []).find(
      (item) => String(item.value) !== String(sourceOption.value)
        && normalizeText(item?.label) === normalizeText(cleanName),
    );

    if (duplicated) {
      setError("Ja existe uma categoria com esse nome nesta loja.");
      return;
    }

    const sourceId = Number(sourceOption.value);
    if (!Number.isFinite(sourceId)) {
      setError("Categoria invalida.");
      return;
    }

    setCategoryActionId(String(categoryValue));
    setError("");

    try {
      const normalizedStoreId = Number(scopedLoja);
      const sourceRow = (tiposMenu || []).find((item) => Number(item.idtipomenu) === sourceId);
      const parsedSource = parseScopedMenuCategory(sourceRow?.tipomenu || "");

      let newTipoId = sourceId;

      if (parsedSource.scoped && parsedSource.storeId === normalizedStoreId) {
        const encodedName = buildScopedMenuCategory(normalizedStoreId, cleanName);

        const { error: updateError } = await supabase
          .from("tiposmenu")
          .update({ tipomenu: encodedName })
          .eq("idtipomenu", sourceId);

        if (updateError) throw updateError;
      } else {
        newTipoId = await ensureScopedTipoMenuIdByLabel(cleanName);

        if (Number.isFinite(newTipoId) && newTipoId !== sourceId) {
          const { error: remapError } = await supabase
            .from("menus")
            .update({ idtipomenu: Number(newTipoId) })
            .eq("idloja", normalizedStoreId)
            .eq("idtipomenu", sourceId);

          if (remapError) throw remapError;
        }
      }

      if (String(form.idtipomenu || "") === String(sourceId)) {
        setForm((prev) => ({ ...prev, idtipomenu: Number.isFinite(newTipoId) ? String(newTipoId) : "" }));
      }

      if (String(categoryFilter || "") === String(sourceId) && Number.isFinite(newTipoId) && newTipoId !== sourceId) {
        setCategoryFilter("ALL");
      }

      cancelCategoryEdit();
      await loadTiposMenu();
      await loadMenus();
    } catch (err) {
      setError(err.message || "Falha ao editar categoria.");
    } finally {
      setCategoryActionId("");
    }
  };

  const handleDeleteCategory = async (option) => {
    if (!option) {
      setError("Categoria invalida.");
      return;
    }

    const sourceId = Number(option.value);
    if (!Number.isFinite(sourceId)) {
      setError("Categoria invalida.");
      return;
    }

    if (!confirm(`Apagar categoria "${option?.label || "sem nome"}" nesta loja?`)) return;

    setCategoryActionId(String(option.value));
    setError("");

    try {
      const normalizedStoreId = Number(scopedLoja);

      const { error: clearMenuCategoryError } = await supabase
        .from("menus")
        .update({ idtipomenu: null })
        .eq("idtipomenu", sourceId)
        .eq("idloja", normalizedStoreId);

      if (clearMenuCategoryError) throw clearMenuCategoryError;

      const sourceRow = (tiposMenu || []).find((item) => Number(item.idtipomenu) === sourceId);
      const parsedSource = parseScopedMenuCategory(sourceRow?.tipomenu || "");

      if (parsedSource.scoped && parsedSource.storeId === normalizedStoreId) {
        const { data: usedRows, error: usedError } = await supabase
          .from("menus")
          .select("idmenu")
          .eq("idtipomenu", sourceId)
          .limit(1);

        if (usedError) throw usedError;

        if (!usedRows || usedRows.length === 0) {
          const { error: deleteError } = await supabase
            .from("tiposmenu")
            .delete()
            .eq("idtipomenu", sourceId);

          if (deleteError) throw deleteError;
        }
      }

      if (String(form.idtipomenu || "") === String(sourceId)) {
        setForm((prev) => ({ ...prev, idtipomenu: "" }));
      }

      if (String(categoryFilter || "") === String(sourceId)) {
        setCategoryFilter("ALL");
      }

      if (String(categoryEditId || "") === String(sourceId)) {
        cancelCategoryEdit();
      }

      await loadTiposMenu();
      await loadMenus();
    } catch (err) {
      setError(err.message || "Falha ao apagar categoria.");
    } finally {
      setCategoryActionId("");
    }
  };

  const tipoLookup = useMemo(() => {
    return new Map((tiposMenu || []).map((tipo) => [
      String(tipo.idtipomenu),
      displayMenuCategoryLabel(tipo.tipomenu),
    ]));
  }, [tiposMenu]);

  const menuCategoryOptions = useMemo(() => {
    const ids = Array.from(
      new Set(
        (menus || [])
          .map((item) => item.idtipomenu)
          .filter((id) => id !== null && id !== undefined && id !== ""),
      ),
    );

    const options = ids.map((id) => {
      const key = String(id);
      return {
        value: key,
        label: tipoLookup.get(key) || `Categoria ${key}`,
      };
    });

    return sortCategoryOptions(options);
  }, [menus, tipoLookup]);

  const scopedPresetCategoryOptions = useMemo(() => {
    const normalizedStoreId = Number(scopedLoja);
    if (!Number.isFinite(normalizedStoreId)) return [];

    const options = (tiposMenu || [])
      .filter((tipo) => {
        const parsed = parseScopedMenuCategory(tipo?.tipomenu);
        return parsed.scoped && parsed.storeId === normalizedStoreId;
      })
      .map((tipo) => ({
        value: String(tipo.idtipomenu),
        label: displayMenuCategoryLabel(tipo.tipomenu),
      }));

    return sortCategoryOptions(options);
  }, [tiposMenu, scopedLoja]);

  const storeCategoryOptions = useMemo(() => {
    const map = new Map();

    [...scopedPresetCategoryOptions, ...menuCategoryOptions].forEach((option) => {
      const key = normalizeText(option.label);
      if (!key || map.has(key)) return;
      map.set(key, option);
    });

    return sortCategoryOptions([...map.values()]);
  }, [menuCategoryOptions, scopedPresetCategoryOptions]);

  const formCategoryOptions = useMemo(() => storeCategoryOptions, [storeCategoryOptions]);
  const manageableCategoryOptions = useMemo(() => storeCategoryOptions, [storeCategoryOptions]);

  useEffect(() => {
    if (categoryFilter === "ALL") return;
    const exists = menuCategoryOptions.some((option) => option.value === categoryFilter);
    if (!exists) {
      setCategoryFilter("ALL");
    }
  }, [categoryFilter, menuCategoryOptions]);

  const stats = useMemo(() => {
    const total = menus.length;
    const active = menus.filter((item) => item.ativo !== false).length;
    const soldOut = total - active;
    return { total, active, soldOut };
  }, [menus]);

  const filteredMenus = useMemo(() => {
    const search = sanitizeSearch(searchText);
    const filtered = menus.filter((item) => {
      if (statusFilter === "ACTIVE" && item.ativo === false) return false;
      if (statusFilter === "SOLD_OUT" && item.ativo !== false) return false;

      if (categoryFilter !== "ALL" && String(item.idtipomenu || "") !== String(categoryFilter)) {
        return false;
      }

      if (!search) return true;

      const haystack = `${item.nome || ""} ${item.desc || ""}`.toLowerCase();
      return haystack.includes(search);
    });

    const sorted = [...filtered];

    if (sortMode === "NAME_ASC") {
      sorted.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt"));
    } else if (sortMode === "PRICE_ASC") {
      sorted.sort((a, b) => Number(a.preco || 0) - Number(b.preco || 0));
    } else if (sortMode === "PRICE_DESC") {
      sorted.sort((a, b) => Number(b.preco || 0) - Number(a.preco || 0));
    } else if (sortMode === "STOCK") {
      sorted.sort((a, b) => Number(b.ativo !== false) - Number(a.ativo !== false));
    } else {
      sorted.sort((a, b) => Number(b.idmenu || 0) - Number(a.idmenu || 0));
    }

    return sorted;
  }, [categoryFilter, menus, searchText, sortMode, statusFilter]);

  const filteredStats = useMemo(() => {
    const visible = filteredMenus.length;
    const visibleActive = filteredMenus.filter((item) => item.ativo !== false).length;
    return { visible, visibleActive };
  }, [filteredMenus]);

  return (
    <div className="dashboard-shell enterprise">
      <header className="dashboard-header" style={{ marginBottom: 16 }}>
        <div>
          <p className="kicker">Menu Manager</p>
          <h1 className="dashboard-title">Gestor de Catalogo</h1>
          <p className="dashboard-subtitle">Criar, editar, esgotar e ilustrar os pratos da loja</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Loja ativa: {storeName ? `${storeName} (#${scopedLoja || "-"})` : (scopedLoja ? `#${scopedLoja}` : "sem associacao")}
          </p>
        </div>
        <div className="dashboard-actions menu-manager-actions">
          {admin && (
            <div className="menu-admin-store-picker">
              <label>
                <span className="muted">Pesquisar restaurante</span>
                <input
                  type="text"
                  placeholder="Nome do restaurante"
                  value={adminStoreSearch}
                  onChange={(e) => setAdminStoreSearch(e.target.value)}
                />
              </label>
              <label>
                <span className="muted">Restaurante</span>
                <select
                  value={lojaId}
                  onChange={(e) => setLojaId(e.target.value)}
                  disabled={!filteredAdminStores.length}
                >
                  {filteredAdminStores.length === 0 ? (
                    <option value="">Sem restaurantes</option>
                  ) : (
                    filteredAdminStores.map((store) => (
                      <option key={store.idloja} value={String(store.idloja)}>
                        {store.nome}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          )}
          <div className="menu-header-buttons">
            <button className="btn-dashboard secondary small" onClick={() => navigate(`/dashboard/restaurante${scopedLoja ? `?loja=${scopedLoja}` : ""}`)}>
              Voltar ao dashboard
            </button>
            <button className="btn-dashboard small" onClick={goToWebsite}>
              Inicio
            </button>
            <button className="btn-dashboard small" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard-grid premium-grid">
        <article className="metric-card premium">
          <div className="metric-label">Pratos no catalogo</div>
          <div className="metric-value">{stats.total}</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Disponiveis</div>
          <div className="metric-value">{stats.active}</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Esgotados</div>
          <div className="metric-value">{stats.soldOut}</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">A mostrar</div>
          <div className="metric-value">{filteredStats.visible}</div>
          <div className="metric-foot">{filteredStats.visibleActive} disponiveis com filtro atual</div>
        </article>
      </section>

      {error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</p>}

      <section className="panel menu-toolbar-panel">
        <div className="menu-toolbar-grid">
          <label>
            <span className="muted">Pesquisar prato</span>
            <input
              type="text"
              placeholder="Nome ou descricao"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </label>

          <label>
            <span className="muted">Estado</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Disponiveis</option>
              <option value="SOLD_OUT">Esgotados</option>
            </select>
          </label>

          <label>
            <span className="muted">Categoria (da loja)</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="ALL">Todas</option>
              {menuCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="muted">Ordenar</span>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
              <option value="RECENT">Mais recentes</option>
              <option value="NAME_ASC">Nome A-Z</option>
              <option value="PRICE_ASC">Preco crescente</option>
              <option value="PRICE_DESC">Preco decrescente</option>
              <option value="STOCK">Disponibilidade</option>
            </select>
          </label>

          <div className="menu-toolbar-actions center">
            <button
              className="btn-dashboard secondary"
              type="button"
              onClick={() => {
                setSearchText("");
                setStatusFilter("ALL");
                setCategoryFilter("ALL");
                setSortMode("RECENT");
              }}
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </section>

      <section className="panel-grid analytics-grid">
        <article className="panel" ref={formPanelRef}>
          <h3>{editingId ? "Editar prato" : "Novo prato"}</h3>
          <form className="menu-form" onSubmit={handleSubmit}>
            <label>
              <span className="muted">Nome do prato</span>
              <input
                type="text"
                placeholder="Ex: Frango no espeto"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                required
              />
            </label>

            <label>
              <span className="muted">Descricao</span>
              <textarea
                placeholder="Descricao do prato"
                value={form.desc}
                onChange={(e) => setForm((prev) => ({ ...prev, desc: e.target.value }))}
                rows={3}
              />
            </label>

            <div className="menu-form-row">
              <label>
                <span className="muted">Preco</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.preco}
                  onChange={(e) => setForm((prev) => ({ ...prev, preco: e.target.value }))}
                  required
                />
              </label>

              <label>
                <span className="muted">Categoria</span>
                <select
                  value={form.idtipomenu}
                  onChange={(e) => setForm((prev) => ({ ...prev, idtipomenu: e.target.value }))}
                >
                  <option value="">Sem categoria</option>
                  {formCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {formCategoryOptions.length === 0 && (
                  <span className="muted menu-form-hint">Sem categorias. Cria no card "Gestao de categorias".</span>
                )}
              </label>
            </div>



            <label className="menu-form-checkbox">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.checked }))}
              />
              Disponivel para venda
            </label>

            <label>
              <span className="muted">Imagem</span>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
            </label>

            {(imagePreviewUrl || form.imagem) && (
              <div className="menu-preview">
                <img
                  src={imagePreviewUrl || form.imagem}
                  alt="Preview"
                />
                <span className="muted">{imageFile ? "Nova imagem selecionada" : "Imagem atual"}</span>
              </div>
            )}

            <div className="menu-form-actions">
              <button className="btn-dashboard" type="submit" disabled={saving}>
                {saving ? "A gravar..." : editingId ? "Guardar alteracoes" : "Criar prato"}
              </button>
              {editingId && (
                <button className="btn-dashboard secondary" type="button" onClick={resetForm}>
                  Cancelar edicao
                </button>
              )}
            </div>
          </form>

          <div className="menu-category-inline">
            <h3>Gestao de categorias</h3>
            <p className="muted" style={{ marginBottom: 10 }}>
              Cria, edita e remove categorias apenas desta loja.
            </p>

            <div className="menu-category-creator">
              <span className="muted">Criar nova categoria</span>
              <div className="menu-category-creator-row">
                <input
                  type="text"
                  placeholder="Ex: Francesinhas"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <button
                  className="btn-dashboard small"
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={creatingCategory || saving || !scopedLoja}
                >
                  {creatingCategory ? "A criar..." : "Criar categoria"}
                </button>
              </div>
            </div>

            <div className="menu-category-collapse">
              <button
                className="btn-dashboard secondary small"
                type="button"
                onClick={() => setCategoriesExpanded((prev) => !prev)}
              >
                {categoriesExpanded ? "Ocultar categorias" : "Gerir categorias"}
              </button>
            </div>

            {categoriesExpanded && (
              <div className="menu-category-list">
                <div className="menu-category-list-head">
                  <h4>Categorias</h4>
                  <span className="muted">Editar e eliminar categorias disponiveis para a loja</span>
                </div>

                {manageableCategoryOptions.length === 0 ? (
                  <p className="muted">Sem categorias.</p>
                ) : (
                  <div className="menu-category-list-grid">
                    {manageableCategoryOptions.map((option) => {
                      const editingCategory = String(categoryEditId) === String(option.value);
                      const rowBusy = String(categoryActionId) === String(option.value);

                      return (
                        <div className="menu-category-item" key={option.value}>
                          {editingCategory ? (
                            <input
                              type="text"
                              value={categoryEditName}
                              onChange={(e) => setCategoryEditName(e.target.value)}
                              disabled={rowBusy}
                            />
                          ) : (
                            <strong>{option.label}</strong>
                          )}

                          <div className="menu-category-item-actions">
                            {editingCategory ? (
                              <>
                                <button
                                  className="btn-dashboard small"
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={() => handleSaveCategory(option.value)}
                                >
                                  {rowBusy ? "A guardar..." : "Guardar"}
                                </button>
                                <button
                                  className="btn-dashboard small secondary"
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={cancelCategoryEdit}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn-dashboard small"
                                  type="button"
                                  disabled={rowBusy || saving}
                                  onClick={() => startCategoryEdit(option)}
                                >
                                  Editar
                                </button>
                                <button
                                  className="btn-dashboard small secondary"
                                  type="button"
                                  disabled={rowBusy || saving}
                                  onClick={() => handleDeleteCategory(option)}
                                >
                                  {rowBusy ? "A apagar..." : "Eliminar"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </article>

        <article className="panel">
          <h3>Pratos da loja</h3>
          {loading ? (
            <p className="muted">A carregar...</p>
          ) : filteredMenus.length === 0 && menus.length > 0 ? (
            <p className="muted">Nenhum prato com os filtros selecionados.</p>
          ) : filteredMenus.length === 0 ? (
            <p className="muted">Sem pratos registados.</p>
          ) : (
            <div className="menu-card-grid">
              {filteredMenus.map((item) => {
                const tipoNome = tipoLookup.get(String(item.idtipomenu || "")) || "Geral";
                const missingDetails = !item.desc || !item.imagem;
                return (
                  <article className="menu-card" key={item.idmenu}>
                    <div className="menu-card-media">
                      {item.imagem ? (
                        <img src={item.imagem} alt={item.nome} />
                      ) : (
                        <div className="menu-card-placeholder">Sem imagem</div>
                      )}
                      <span className={item.ativo !== false ? "tag ok" : "tag warn"}>
                        {item.ativo !== false ? "Disponivel" : "Esgotado"}
                      </span>
                    </div>
                    <div className="menu-card-body">
                      <h4>{item.nome}</h4>
                      <p className="muted menu-card-desc">{item.desc || "Sem descricao"}</p>
                      {missingDetails && (
                        <p className="menu-card-hint">Completa descricao e imagem para melhorar o card na pagina de lojas.</p>
                      )}
                      <div className="menu-card-meta">
                        <span>{tipoNome}</span>
                        <strong>{formatCurrency(item.preco)}</strong>
                      </div>
                      <div className="menu-card-actions">
                        <button className="btn-dashboard small" onClick={() => startEdit(item)}>
                          {missingDetails ? "Completar dados" : "Editar"}
                        </button>
                        <button
                          className="btn-dashboard small secondary"
                          onClick={() => handleToggle(item)}
                        >
                          {item.ativo !== false ? "Marcar esgotado" : "Marcar disponivel"}
                        </button>
                        <button
                          className="btn-dashboard small secondary"
                          onClick={() => handleDelete(item.idmenu, item.nome)}
                        >
                          Apagar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}






























































