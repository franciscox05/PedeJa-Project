import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createMenu,
  createMenuOptionLibraryGroup,
  duplicateMenuOptionLibraryGroup,
  deleteMenu,
  deleteMenuOptionLibraryGroup,
  fetchMenuOptionLibrary,
  fetchMenus,
  reorderMenuOptionLibraryGroups,
  toggleDisponivel,
  toggleVisibilidade,
  updateMenu,
  updateMenuOptionLibraryGroup,
  uploadMenuImage,
} from "../services/menuManagerService";
import MenuOptionBuilderModal from "../components/MenuOptionBuilderModal";
import {
  describeMenuOptionSelectionMode,
  getMenuOptionTypeLabel,
  sanitizeMenuOptionsConfig,
} from "../services/menuOptionsService";
import { resolveRestaurantStoreId } from "../services/opsDashboardService";
import { supabase } from "../services/supabaseClient";
import { extractRestaurantId, isAdmin } from "../utils/roles";
import "../css/pages/dashboard.css";

const STORE_MENU_CATEGORY_PREFIX = "__store_menu__";
const MENU_MANAGER_TABS = { CATALOG: "pratos", LIBRARY: "biblioteca" };
const LIBRARY_TYPE_OPTIONS = [
  { value: "extra", label: "Extra" },
  { value: "complementar", label: "Complementar" },
  { value: "sugestao", label: "Sugestao" },
];

const formatCurrency = (value) => `${Number(value || 0).toFixed(2)}EUR`;
const sanitizeSearch = (value) => String(value || "").trim().toLowerCase();
const normalizeText = (value) => String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const parseSessionUser = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
const parseCategoryValue = (value) => {
  const raw = String(value || "");
  if (!raw) return { kind: "empty", id: null };
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? { kind: "id", id: numeric } : { kind: "empty", id: null };
};
const parseScopedMenuCategory = (rawName) => {
  const raw = String(rawName || "").trim();
  if (!raw.startsWith(STORE_MENU_CATEGORY_PREFIX)) return { scoped: false, storeId: null, label: raw };
  const rest = raw.slice(STORE_MENU_CATEGORY_PREFIX.length);
  const separator = rest.indexOf("::");
  if (separator < 0) return { scoped: false, storeId: null, label: raw };
  const storeId = Number(rest.slice(0, separator));
  const label = rest.slice(separator + 2).trim();
  if (!Number.isFinite(storeId) || !label) return { scoped: false, storeId: null, label: raw };
  return { scoped: true, storeId, label };
};
const buildScopedMenuCategory = (storeId, label) => `${STORE_MENU_CATEGORY_PREFIX}${Number(storeId)}::${String(label || "").trim()}`;
const displayMenuCategoryLabel = (rawName) => parseScopedMenuCategory(rawName).label || String(rawName || "").trim();
const sortCategoryOptions = (list = []) => [...list].sort((a, b) => String(a?.label || "").localeCompare(String(b?.label || ""), "pt", { sensitivity: "base" }));
const mergeTiposMenu = (current = [], nextItem = null) => {
  const map = new Map();
  [...current, ...(nextItem ? [nextItem] : [])].forEach((item) => item?.idtipomenu && map.set(String(item.idtipomenu), item));
  return [...map.values()].sort((a, b) => String(a?.tipomenu || "").localeCompare(String(b?.tipomenu || ""), "pt", { sensitivity: "base" }));
};
const createEmptyLibraryOption = (index = 0) => ({
  id: `local-option-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  price: "0",
  defaultSelected: false,
});
const createEmptyLibraryForm = () => ({ title: "", type: "extra", required: false, maxSelections: 1, options: [createEmptyLibraryOption(0)] });
const getLibraryGroupKey = (group) => String(group?.library_group_id || group?.id || "");
const createEmptyForm = () => ({
  nome: "",
  desc: "",
  preco: "",
  ativo: true,
  visivel: true,
  imagem: "",
  idtipomenu: "",
  configuracao_opcoes: [],
  menu_option_group_ids: [],
});
const normalizeLibraryGroupForForm = (group = null) => !group ? createEmptyLibraryForm() : ({
  title: String(group?.title || "").trim(),
  type: String(group?.type || "extra") || "extra",
  required: Boolean(group?.required),
  maxSelections: Math.max(1, Number(group?.maxSelections ?? 1) || 1),
  options: Array.isArray(group?.options) && group.options.length > 0
    ? group.options.map((option, index) => ({
      id: option?.id || createEmptyLibraryOption(index).id,
      name: String(option?.name || "").trim(),
      price: String(option?.price ?? "0"),
      defaultSelected: Boolean(option?.defaultSelected),
    }))
    : [createEmptyLibraryOption(0)],
});

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

  const [activeTab, setActiveTab] = useState(MENU_MANAGER_TABS.CATALOG);
  const [fixedStoreId, setFixedStoreId] = useState(roleStoreId || "");
  const [lojaId, setLojaId] = useState(initialStoreId);
  const [adminStores, setAdminStores] = useState([]);
  const [adminStoreSearch, setAdminStoreSearch] = useState("");
  const [storeName, setStoreName] = useState("");
  const [menus, setMenus] = useState([]);
  const [tiposMenu, setTiposMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("RECENT");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryActionId, setCategoryActionId] = useState("");
  const [categoryEditId, setCategoryEditId] = useState("");
  const [categoryEditName, setCategoryEditName] = useState("");
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [libraryGroups, setLibraryGroups] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySaving, setLibrarySaving] = useState(false);
  const [libraryOrdering, setLibraryOrdering] = useState(false);
  const [libraryGroupOrderDraft, setLibraryGroupOrderDraft] = useState([]);
  const [libraryGroupOrderDirty, setLibraryGroupOrderDirty] = useState(false);
  const [libraryEditingId, setLibraryEditingId] = useState(null);
  const [libraryForm, setLibraryForm] = useState(createEmptyLibraryForm());
  const [modifierManagerTarget, setModifierManagerTarget] = useState(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return undefined;
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
    return () => { active = false; };
  }, [admin, roleStoreId, user]);

  useEffect(() => {
    if (admin && queryStoreId) setLojaId(String(queryStoreId));
  }, [admin, queryStoreId]);

  const filteredAdminStores = useMemo(() => {
    const search = sanitizeSearch(adminStoreSearch);
    if (!search) return adminStores;
    return (adminStores || []).filter((store) => sanitizeSearch(store.nome).includes(search));
  }, [adminStoreSearch, adminStores]);

  useEffect(() => {
    if (!admin || !adminStores.length || !filteredAdminStores.length) return;
    const exists = filteredAdminStores.some((store) => String(store.idloja) === String(lojaId));
    if (!lojaId || !exists) setLojaId(String(filteredAdminStores[0].idloja));
  }, [admin, adminStores, filteredAdminStores, lojaId]);

  const scopedLoja = admin ? lojaId : fixedStoreId;

  useEffect(() => {
    let active = true;
    const loadStoreIdentity = async () => {
      if (!scopedLoja) {
        if (active) setStoreName("");
        return;
      }
      const { data, error: storeError } = await supabase.from("lojas").select("idloja, nome").eq("idloja", Number(scopedLoja)).maybeSingle();
      if (!active) return;
      setStoreName(storeError ? "" : (data?.nome || ""));
    };
    loadStoreIdentity();
    return () => { active = false; };
  }, [scopedLoja]);

  const loadAdminStores = useCallback(async () => {
    if (!admin) {
      setAdminStores([]);
      return;
    }
    const { data, error: storeError } = await supabase.from("lojas").select("idloja, nome").order("idloja", { ascending: true });
    if (storeError) {
      setAdminStores([]);
      return;
    }
    const stores = data || [];
    setAdminStores(stores);
    setLojaId((prev) => {
      if (queryStoreId && stores.some((store) => String(store.idloja) === String(queryStoreId))) return String(queryStoreId);
      if (prev && stores.some((store) => String(store.idloja) === String(prev))) return String(prev);
      return stores.length > 0 ? String(stores[0].idloja) : "";
    });
  }, [admin, queryStoreId]);

  const loadTiposMenu = useCallback(async () => {
    const { data, error: tiposError } = await supabase.from("tiposmenu").select("idtipomenu, tipomenu").order("idtipomenu", { ascending: true });
    setTiposMenu(tiposError ? [] : (data || []));
  }, []);

  const loadMenus = useCallback(async () => {
    if (!scopedLoja) {
      setError("Sem loja associada a esta conta.");
      setLoading(false);
      setMenus([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setMenus(await fetchMenus(scopedLoja));
    } catch (err) {
      setError(err.message || "Falha ao carregar menu.");
      setMenus([]);
    } finally {
      setLoading(false);
    }
  }, [scopedLoja]);

  const loadLibraryGroups = useCallback(async () => {
    if (!scopedLoja) {
      setLibraryGroups([]);
      setLibraryGroupOrderDraft([]);
      setLibraryGroupOrderDirty(false);
      return;
    }
    setLibraryLoading(true);
    try {
      const groups = await fetchMenuOptionLibrary(scopedLoja);
      setLibraryGroups(groups);
      setLibraryGroupOrderDraft((groups || []).map((group) => getLibraryGroupKey(group)).filter(Boolean));
      setLibraryGroupOrderDirty(false);
    } catch (err) {
      setError(err.message || "Falha ao carregar a biblioteca de extras.");
      setLibraryGroups([]);
      setLibraryGroupOrderDraft([]);
      setLibraryGroupOrderDirty(false);
    } finally {
      setLibraryLoading(false);
    }
  }, [scopedLoja]);

  useEffect(() => { loadAdminStores(); }, [loadAdminStores]);
  useEffect(() => { loadTiposMenu(); }, [loadTiposMenu]);
  useEffect(() => { loadMenus(); loadLibraryGroups(); }, [loadMenus, loadLibraryGroups]);

  const resetForm = useCallback(() => {
    setForm(createEmptyForm());
    setImageFile(null);
    setEditingId(null);
  }, []);
  const resetLibraryForm = useCallback(() => {
    setLibraryEditingId(null);
    setLibraryForm(createEmptyLibraryForm());
  }, []);

  const scrollToForm = () => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const goToDashboard = () => admin ? navigate(`/dashboard/restaurante${scopedLoja ? `?loja=${scopedLoja}&from=admin` : ""}`) : navigate("/dashboard/restaurante");
  const goToWebsite = () => navigate("/");
  const handleLogout = () => {
    localStorage.removeItem("pedeja_user");
    localStorage.removeItem("pedeja_cart");
    navigate("/", { replace: true });
  };
  const openModifierManager = (menuLike) => {
    const menuId = Number(menuLike?.idmenu || editingId);
    if (!Number.isFinite(menuId)) {
      setError("Guarda primeiro o prato para gerir modificadores.");
      return;
    }
    setModifierManagerTarget({
      idmenu: menuId,
      nome: String(menuLike?.nome || form.nome || "").trim() || `Prato #${menuId}`,
    });
  };
  const closeModifierManager = () => setModifierManagerTarget(null);
  const activeModifierMenuItem = useMemo(() => {
    if (!modifierManagerTarget?.idmenu) return null;
    const liveMenu = (menus || []).find((item) => String(item.idmenu) === String(modifierManagerTarget.idmenu));
    return liveMenu || modifierManagerTarget;
  }, [menus, modifierManagerTarget]);
  const handleModifierManagerSaved = useCallback(async () => {
    await Promise.all([loadMenus(), loadLibraryGroups()]);
  }, [loadMenus, loadLibraryGroups]);

  const patchLibraryForm = (patch) => setLibraryForm((prev) => ({ ...prev, ...patch }));
  const handleAddLibraryOption = () => setLibraryForm((prev) => ({
    ...prev,
    options: [...prev.options, createEmptyLibraryOption(prev.options.length)],
  }));
  const handleRemoveLibraryOption = (optionId) => setLibraryForm((prev) => {
    const nextOptions = prev.options.filter((option) => option.id !== optionId);
    return { ...prev, options: nextOptions.length > 0 ? nextOptions : [createEmptyLibraryOption(0)] };
  });
  const handleUpdateLibraryOption = (optionId, patch) => setLibraryForm((prev) => ({
    ...prev,
    options: prev.options.map((option) => option.id === optionId ? { ...option, ...patch } : option),
  }));
  const handleMoveLibraryOption = (optionId, direction) => setLibraryForm((prev) => {
    const options = Array.isArray(prev.options) ? [...prev.options] : [];
    const currentIndex = options.findIndex((option) => option.id === optionId);
    if (currentIndex < 0) return prev;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= options.length) return prev;

    [options[currentIndex], options[targetIndex]] = [options[targetIndex], options[currentIndex]];
    return { ...prev, options };
  });
  const handleMoveLibraryGroup = (group, direction) => {
    const groupId = getLibraryGroupKey(group);
    if (!groupId) return;

    const currentOrder = (
      Array.isArray(libraryGroupOrderDraft) && libraryGroupOrderDraft.length > 0
        ? libraryGroupOrderDraft
        : orderedLibraryGroups.map((entry) => getLibraryGroupKey(entry))
    )
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    const currentIndex = currentOrder.findIndex((entry) => entry === groupId);
    if (currentIndex < 0) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const nextOrder = [...currentOrder];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];

    setLibraryGroupOrderDraft(nextOrder);
    setLibraryGroupOrderDirty(true);
  };
  const handleResetLibraryGroupOrder = () => {
    const defaultOrder = (Array.isArray(libraryGroups) ? libraryGroups : [])
      .map((group) => getLibraryGroupKey(group))
      .filter(Boolean);
    setLibraryGroupOrderDraft(defaultOrder);
    setLibraryGroupOrderDirty(false);
  };
  const handleSaveLibraryGroupOrder = async () => {
    if (!libraryGroupOrderDirty || !scopedLoja) return;
    setLibraryOrdering(true);
    setError("");
    try {
      const order = [...new Set(
        (Array.isArray(libraryGroupOrderDraft) ? libraryGroupOrderDraft : [])
          .map((entry) => String(entry || "").trim())
          .filter(Boolean),
      )];

      if (order.length === 0) {
        setLibraryOrdering(false);
        return;
      }

      await reorderMenuOptionLibraryGroups(scopedLoja, order);
      await Promise.all([loadLibraryGroups(), loadMenus()]);
      setLibraryGroupOrderDirty(false);
    } catch (err) {
      setError(err.message || "Erro ao guardar a ordem dos grupos da biblioteca.");
    } finally {
      setLibraryOrdering(false);
    }
  };
  const handleDuplicateLibraryGroup = async (group) => {
    const sourceGroupId = group?.library_group_id || group?.id;
    if (!sourceGroupId) return;

    const suggestedName = `${group?.title || "Grupo"} (Copia)`;
    const duplicatedName = window.prompt("Nome do grupo duplicado:", suggestedName);
    if (!duplicatedName || !duplicatedName.trim()) return;

    setLibrarySaving(true);
    setError("");
    try {
      const duplicated = await duplicateMenuOptionLibraryGroup(scopedLoja, sourceGroupId, {
        title: duplicatedName.trim(),
      });

      if (duplicated?.id || duplicated?.library_group_id) {
        setLibraryGroupOrderDraft((prev) => {
          const current = Array.isArray(prev) ? prev.map((entry) => String(entry)) : [];
          const nextId = String(duplicated.id || duplicated.library_group_id);
          if (current.includes(nextId)) return current;
          return [...current, nextId];
        });
        setLibraryGroupOrderDirty(true);
      }

      await Promise.all([loadLibraryGroups(), loadMenus()]);
    } catch (err) {
      setError(err.message || "Erro ao duplicar grupo da biblioteca.");
    } finally {
      setLibrarySaving(false);
    }
  };
  const handleToggleLibraryGroupForMenu = (groupId) => setForm((prev) => {
    const current = new Set((prev.menu_option_group_ids || []).map(String));
    const normalized = String(groupId);
    current.has(normalized) ? current.delete(normalized) : current.add(normalized);
    return { ...prev, menu_option_group_ids: [...current] };
  });

  const ensureScopedTipoMenuIdByLabel = async (categoryName) => {
    const cleanName = String(categoryName || "").trim();
    const normalizedStoreId = Number(scopedLoja);
    if (!cleanName || !Number.isFinite(normalizedStoreId)) throw new Error("Sem loja ativa para gerir categorias.");

    const existingOption = storeCategoryOptions.find((option) => normalizeText(option.label) === normalizeText(cleanName));
    const parsedExisting = parseCategoryValue(existingOption?.value);
    if (parsedExisting.kind === "id" && Number.isFinite(parsedExisting.id)) return Number(parsedExisting.id);

    const existingScoped = (tiposMenu || []).find((item) => {
      const parsed = parseScopedMenuCategory(item?.tipomenu);
      return parsed.scoped && parsed.storeId === normalizedStoreId && normalizeText(parsed.label) === normalizeText(cleanName);
    });
    if (existingScoped?.idtipomenu) return Number(existingScoped.idtipomenu);

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
    return parsed.kind === "id" && Number.isFinite(parsed.id) ? Number(parsed.id) : null;
  };

  const validateForm = () => {
    const nome = String(form.nome || "").trim();
    const preco = Number(String(form.preco || "").replace(",", "."));
    if (!scopedLoja) return "Define a loja antes de criar um prato.";
    if (nome.length < 2) return "O nome do prato deve ter pelo menos 2 caracteres.";
    if (!Number.isFinite(preco) || preco < 0) return "Preco invalido. Usa um valor igual ou superior a 0.";
    if (String(form.desc || "").length > 700) return "Descricao demasiado longa (maximo 700 caracteres).";
    if (imageFile && !String(imageFile.type || "").startsWith("image/")) return "O ficheiro selecionado nao e uma imagem valida.";
    return "";
  };

  const validateLibraryForm = () => {
    const title = String(libraryForm.title || "").trim();
    const maxSelections = Number(libraryForm.maxSelections);
    const validOptions = (libraryForm.options || [])
      .map((option) => ({
        ...option,
        name: String(option.name || "").trim(),
        price: Number(String(option.price ?? "").replace(",", ".")),
      }))
      .filter((option) => option.name);
    if (!scopedLoja) return "Define a loja antes de gerir a biblioteca.";
    if (title.length < 2) return "O grupo precisa de um titulo com pelo menos 2 caracteres.";
    if (!Number.isFinite(maxSelections) || maxSelections < 1) return "O maximo de selecoes tem de ser pelo menos 1.";
    if (validOptions.length === 0) return "Adiciona pelo menos um item ao grupo.";
    if (validOptions.some((option) => !Number.isFinite(option.price) || option.price < 0)) return "Todos os itens precisam de um preco valido.";
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
      if (imageFile) imageUrl = await uploadMenuImage(imageFile, scopedLoja);

      const resolvedTipoId = await resolveFormCategoryToTipoId(form.idtipomenu);
      const payload = {
        ...form,
        idtipomenu: resolvedTipoId ? String(resolvedTipoId) : "",
        imagem: imageUrl,
        configuracao_opcoes: sanitizeMenuOptionsConfig(form.configuracao_opcoes),
        menu_option_group_ids: form.menu_option_group_ids || [],
      };

      if (editingId) await updateMenu(scopedLoja, editingId, payload);
      else await createMenu(scopedLoja, payload);

      resetForm();
      await Promise.all([loadMenus(), loadLibraryGroups()]);
    } catch (err) {
      setError(err.message || "Erro ao gravar prato.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.idmenu);
    setActiveTab(MENU_MANAGER_TABS.CATALOG);
    setForm({
      nome: item.nome || "",
      desc: item.desc || "",
      preco: item.preco ?? "",
      ativo: item.ativo !== false,
      visivel: item.visivel !== false,
      imagem: item.imagem || "",
      idtipomenu: item.idtipomenu ? String(item.idtipomenu) : "",
      configuracao_opcoes: sanitizeMenuOptionsConfig(item.raw_configuracao_opcoes || item.configuracao_opcoes),
      menu_option_group_ids: Array.isArray(item.menu_option_group_ids) ? item.menu_option_group_ids.map(String) : [],
    });
    setImageFile(null);
    scrollToForm();
  };

  const handleDelete = async (idmenu, nome) => {
    if (!window.confirm(`Apagar o prato "${nome || "sem nome"}"?`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteMenu(scopedLoja, idmenu);
      if (editingId === idmenu) resetForm();
      await Promise.all([loadMenus(), loadLibraryGroups()]);
    } catch (err) {
      setError(err.message || "Erro ao apagar prato.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item) => {
    try {
      await toggleDisponivel(scopedLoja, item.idmenu, !(item.ativo !== false));
      await loadMenus();
    } catch (err) {
      setError(err.message || "Erro ao alterar disponibilidade.");
    }
  };

  const handleToggleVisibility = async (item) => {
    try {
      await toggleVisibilidade(scopedLoja, item.idmenu, !(item.visivel !== false));
      await loadMenus();
    } catch (err) {
      setError(err.message || "Erro ao alterar visibilidade.");
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
      if (idtipomenu) setForm((prev) => ({ ...prev, idtipomenu: String(idtipomenu) }));
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
    const sourceOption = storeCategoryOptions.find((item) => String(item.value) === String(categoryValue));
    if (!sourceOption) {
      setError("Categoria invalida.");
      return;
    }

    const cleanName = String(categoryEditName || "").trim();
    if (cleanName.length < 2) {
      setError("O nome da categoria deve ter pelo menos 2 caracteres.");
      return;
    }

    const duplicated = storeCategoryOptions.find(
      (item) => String(item.value) !== String(sourceOption.value) && normalizeText(item.label) === normalizeText(cleanName),
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
        const { error: updateError } = await supabase.from("tiposmenu").update({ tipomenu: encodedName }).eq("idtipomenu", sourceId);
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
      await Promise.all([loadTiposMenu(), loadMenus()]);
    } catch (err) {
      setError(err.message || "Falha ao editar categoria.");
    } finally {
      setCategoryActionId("");
    }
  };

  const handleDeleteCategory = async (option) => {
    const sourceId = Number(option?.value);
    if (!Number.isFinite(sourceId)) {
      setError("Categoria invalida.");
      return;
    }
    if (!window.confirm(`Apagar categoria "${option?.label || "sem nome"}" nesta loja?`)) return;

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
        const { data: usedRows, error: usedError } = await supabase.from("menus").select("idmenu").eq("idtipomenu", sourceId).limit(1);
        if (usedError) throw usedError;
        if (!usedRows || usedRows.length === 0) {
          const { error: deleteError } = await supabase.from("tiposmenu").delete().eq("idtipomenu", sourceId);
          if (deleteError) throw deleteError;
        }
      }

      if (String(form.idtipomenu || "") === String(sourceId)) setForm((prev) => ({ ...prev, idtipomenu: "" }));
      if (String(categoryFilter || "") === String(sourceId)) setCategoryFilter("ALL");
      if (String(categoryEditId || "") === String(sourceId)) cancelCategoryEdit();
      await Promise.all([loadTiposMenu(), loadMenus()]);
    } catch (err) {
      setError(err.message || "Falha ao apagar categoria.");
    } finally {
      setCategoryActionId("");
    }
  };

  const startEditLibraryGroup = (group) => {
    setLibraryEditingId(group.library_group_id || String(group.id || ""));
    setLibraryForm(normalizeLibraryGroupForForm(group));
    setActiveTab(MENU_MANAGER_TABS.LIBRARY);
  };

  const handleSaveLibraryGroup = async (e) => {
    e.preventDefault();
    const validationError = validateLibraryForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLibrarySaving(true);
    setError("");
    try {
      const payload = {
        ...libraryForm,
        title: String(libraryForm.title || "").trim(),
        maxSelections: Math.max(1, Number(libraryForm.maxSelections) || 1),
        options: (libraryForm.options || [])
          .map((option) => ({
            ...option,
            name: String(option.name || "").trim(),
            price: Number(String(option.price ?? "").replace(",", ".")),
          }))
          .filter((option) => option.name),
      };
      if (libraryEditingId) await updateMenuOptionLibraryGroup(scopedLoja, libraryEditingId, payload);
      else await createMenuOptionLibraryGroup(scopedLoja, payload);
      resetLibraryForm();
      await Promise.all([loadLibraryGroups(), loadMenus()]);
    } catch (err) {
      setError(err.message || "Erro ao guardar grupo da biblioteca.");
    } finally {
      setLibrarySaving(false);
    }
  };

  const handleDeleteLibraryGroup = async (group) => {
    if (!window.confirm(`Apagar o grupo "${group?.title || "sem titulo"}" da biblioteca?`)) return;

    setLibrarySaving(true);
    setError("");
    try {
      await deleteMenuOptionLibraryGroup(scopedLoja, group.library_group_id || group.id);
      if (String(libraryEditingId || "") === String(group.library_group_id || group.id)) resetLibraryForm();
      setForm((prev) => ({
        ...prev,
        menu_option_group_ids: (prev.menu_option_group_ids || []).filter(
          (selectedId) => String(selectedId) !== String(group.library_group_id || group.id),
        ),
      }));
      await Promise.all([loadLibraryGroups(), loadMenus()]);
    } catch (err) {
      setError(err.message || "Erro ao apagar grupo da biblioteca.");
    } finally {
      setLibrarySaving(false);
    }
  };

  const tipoLookup = useMemo(() => new Map((tiposMenu || []).map((tipo) => [String(tipo.idtipomenu), displayMenuCategoryLabel(tipo.tipomenu)])), [tiposMenu]);
  const menuCategoryOptions = useMemo(() => sortCategoryOptions(
    Array.from(new Set((menus || []).map((item) => item.idtipomenu).filter((id) => id !== null && id !== undefined && id !== "")))
      .map((id) => ({ value: String(id), label: tipoLookup.get(String(id)) || `Categoria ${id}` })),
  ), [menus, tipoLookup]);
  const scopedPresetCategoryOptions = useMemo(() => {
    const normalizedStoreId = Number(scopedLoja);
    if (!Number.isFinite(normalizedStoreId)) return [];
    return sortCategoryOptions((tiposMenu || []).filter((item) => {
      const parsed = parseScopedMenuCategory(item?.tipomenu);
      return parsed.scoped && parsed.storeId === normalizedStoreId;
    }).map((tipo) => ({ value: String(tipo.idtipomenu), label: displayMenuCategoryLabel(tipo.tipomenu) })));
  }, [tiposMenu, scopedLoja]);
  const storeCategoryOptions = useMemo(() => {
    const map = new Map();
    [...scopedPresetCategoryOptions, ...menuCategoryOptions].forEach((option) => {
      const key = normalizeText(option.label);
      if (key && !map.has(key)) map.set(key, option);
    });
    return sortCategoryOptions([...map.values()]);
  }, [menuCategoryOptions, scopedPresetCategoryOptions]);
  const formCategoryOptions = useMemo(() => storeCategoryOptions, [storeCategoryOptions]);
  const manageableCategoryOptions = useMemo(() => storeCategoryOptions, [storeCategoryOptions]);

  useEffect(() => {
    if (categoryFilter !== "ALL" && !menuCategoryOptions.some((option) => option.value === categoryFilter)) {
      setCategoryFilter("ALL");
    }
  }, [categoryFilter, menuCategoryOptions]);

  const stats = useMemo(() => {
    const total = menus.length;
    const active = menus.filter((item) => item.ativo !== false).length;
    const hidden = menus.filter((item) => item.visivel === false).length;
    return { total, active, soldOut: total - active, hidden };
  }, [menus]);

  const filteredMenus = useMemo(() => {
    const search = sanitizeSearch(searchText);
    const filtered = menus.filter((item) => {
      if (statusFilter === "ACTIVE" && item.ativo === false) return false;
      if (statusFilter === "SOLD_OUT" && item.ativo !== false) return false;
      if (statusFilter === "HIDDEN" && item.visivel !== false) return false;
      if (categoryFilter !== "ALL" && String(item.idtipomenu || "") !== String(categoryFilter)) return false;
      if (!search) return true;
      return `${item.nome || ""} ${item.desc || ""}`.toLowerCase().includes(search);
    });

    const sorted = [...filtered];
    if (sortMode === "NAME_ASC") sorted.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt"));
    else if (sortMode === "PRICE_ASC") sorted.sort((a, b) => Number(a.preco || 0) - Number(b.preco || 0));
    else if (sortMode === "PRICE_DESC") sorted.sort((a, b) => Number(b.preco || 0) - Number(a.preco || 0));
    else if (sortMode === "STOCK") sorted.sort((a, b) => Number(b.ativo !== false) - Number(a.ativo !== false));
    else sorted.sort((a, b) => Number(b.idmenu || 0) - Number(a.idmenu || 0));
    return sorted;
  }, [categoryFilter, menus, searchText, sortMode, statusFilter]);

  const filteredStats = useMemo(() => ({
    visible: filteredMenus.length,
    visibleActive: filteredMenus.filter((item) => item.ativo !== false).length,
  }), [filteredMenus]);

  const selectedLibraryGroupIds = useMemo(() => new Set((form.menu_option_group_ids || []).map(String)), [form.menu_option_group_ids]);
  const formLinkedLibraryGroups = useMemo(() => (
    (libraryGroups || []).filter((group) => selectedLibraryGroupIds.has(String(group.library_group_id || group.id)))
  ), [libraryGroups, selectedLibraryGroupIds]);
  const formLegacyGroups = useMemo(() => sanitizeMenuOptionsConfig(form.configuracao_opcoes || []).filter((group) => !group.library_group_id), [form.configuracao_opcoes]);
  const orderedLibraryGroups = useMemo(() => {
    const source = Array.isArray(libraryGroups) ? libraryGroups : [];
    if (!Array.isArray(libraryGroupOrderDraft) || libraryGroupOrderDraft.length === 0) {
      return source;
    }

    const byId = new Map(source.map((group) => [getLibraryGroupKey(group), group]));
    const ordered = libraryGroupOrderDraft
      .map((groupId) => byId.get(String(groupId)))
      .filter(Boolean);
    const leftovers = source.filter((group) => !libraryGroupOrderDraft.includes(getLibraryGroupKey(group)));
    return [...ordered, ...leftovers];
  }, [libraryGroupOrderDraft, libraryGroups]);

  const renderCatalogTab = () => (
    <>
      <section className="panel menu-toolbar-panel">
        <div className="menu-toolbar-grid">
          <label>
            <span className="muted">Pesquisar prato</span>
            <input type="text" placeholder="Nome ou descricao" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </label>
          <label>
            <span className="muted">Estado</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Disponiveis</option>
              <option value="SOLD_OUT">Esgotados</option>
              <option value="HIDDEN">Escondidos ao cliente</option>
            </select>
          </label>
          <label>
            <span className="muted">Categoria (da loja)</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="ALL">Todas</option>
              {menuCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
              <input type="text" placeholder="Ex: Frango no espeto" value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} required />
            </label>

            <label>
              <span className="muted">Descricao</span>
              <textarea placeholder="Descricao do prato" value={form.desc} onChange={(e) => setForm((prev) => ({ ...prev, desc: e.target.value }))} rows={3} />
            </label>

            <div className="menu-form-row">
              <label>
                <span className="muted">Preco</span>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={form.preco} onChange={(e) => setForm((prev) => ({ ...prev, preco: e.target.value }))} required />
              </label>

              <label>
                <span className="muted">Categoria</span>
                <select value={form.idtipomenu} onChange={(e) => setForm((prev) => ({ ...prev, idtipomenu: e.target.value }))}>
                  <option value="">Sem categoria</option>
                  {formCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {formCategoryOptions.length === 0 && <span className="muted menu-form-hint">Sem categorias. Cria no card "Gestao de categorias".</span>}
              </label>
            </div>

            <section className="menu-options-builder">
              <div className="menu-options-builder-head">
                <div>
                  <span className="muted">Biblioteca global</span>
                  <h4>Extras, complementares e sugestoes</h4>
                  <p className="menu-builder-caption muted">Associa grupos globais ao prato. O preco vem sempre da biblioteca.</p>
                </div>
                <div className="menu-card-actions">
                  <button className="btn-dashboard secondary small" type="button" onClick={() => setActiveTab(MENU_MANAGER_TABS.LIBRARY)}>
                    Gerir biblioteca
                  </button>
                  <button className="btn-dashboard small" type="button" onClick={() => openModifierManager({ idmenu: editingId, nome: form.nome })} disabled={!editingId}>
                    Gerir opcoes / modificadores
                  </button>
                </div>
              </div>
              {!editingId && <p className="menu-builder-caption muted">Guarda primeiro o prato para abrir o gestor de modificadores por menu.</p>}

              {libraryLoading ? (
                <p className="menu-builder-empty muted">A carregar grupos globais...</p>
              ) : libraryGroups.length === 0 ? (
                <div className="menu-builder-empty">
                  <p className="muted">Ainda nao existem grupos na biblioteca.</p>
                  <button className="btn-dashboard secondary small" type="button" onClick={() => setActiveTab(MENU_MANAGER_TABS.LIBRARY)}>
                    Criar primeiro grupo
                  </button>
                </div>
              ) : (
                <>
                  <div className="menu-library-selection-summary">
                    <strong>Grupos associados: {formLinkedLibraryGroups.length}</strong>
                    {formLinkedLibraryGroups.length > 0 ? (
                      <div className="menu-library-selection-tags">
                        {formLinkedLibraryGroups.map((group) => <span className="tag soft" key={group.library_group_id || group.id}>{group.title}</span>)}
                      </div>
                    ) : (
                      <p className="muted">Este prato ainda nao tem grupos ligados.</p>
                    )}
                    {formLegacyGroups.length > 0 && <p className="muted">Este prato ainda preserva {formLegacyGroups.length} grupo(s) antigo(s) inline.</p>}
                  </div>

                  <div className="menu-library-association-grid">
                    {orderedLibraryGroups.map((group) => {
                      const groupId = String(group.library_group_id || group.id);
                      const checked = selectedLibraryGroupIds.has(groupId);
                      return (
                        <label className={`menu-library-association-card ${checked ? "is-selected" : ""}`} key={groupId}>
                          <div className="menu-library-association-head">
                            <div className="menu-library-association-check">
                              <input type="checkbox" checked={checked} onChange={() => handleToggleLibraryGroupForMenu(groupId)} />
                              <strong>{group.title}</strong>
                            </div>
                            <span className="menu-library-count">{group.options?.length || 0} itens</span>
                          </div>

                          <div className="menu-library-association-meta">
                            <span>{getMenuOptionTypeLabel(group.type)}</span>
                            <span>{describeMenuOptionSelectionMode(group)}</span>
                            <span>{group.linked_menu_count || 0} pratos ligados</span>
                          </div>

                          <div className="menu-library-association-items">
                            {(group.options || []).slice(0, 4).map((option) => (
                              <span key={option.id}>
                                {option.name} {Number(option.price || 0) > 0 ? `+${formatCurrency(option.price)}` : "(sem extra)"}
                              </span>
                            ))}
                            {(group.options || []).length > 4 && <span>+{(group.options || []).length - 4} itens</span>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            <label className="menu-form-checkbox">
              <input type="checkbox" checked={form.visivel} onChange={(e) => setForm((prev) => ({ ...prev, visivel: e.target.checked }))} />
              <span className="menu-form-checkbox-box">
                <strong>Mostrar na app do cliente</strong>
                <small className="muted">Se desligado, o prato continua no catalogo mas fica escondido ao cliente.</small>
              </span>
            </label>

            <label className="menu-form-checkbox">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.checked }))} />
              <span className="menu-form-checkbox-box">
                <strong>Disponivel para venda</strong>
                <small className="muted">Desliga para marcar como esgotado sem apagar o prato.</small>
              </span>
            </label>

            <label>
              <span className="muted">Imagem</span>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
            </label>

            {(imagePreviewUrl || form.imagem) && (
              <div className="menu-preview">
                <img src={imagePreviewUrl || form.imagem} alt="Preview" />
                <span className="muted">{imageFile ? "Nova imagem selecionada" : "Imagem atual"}</span>
              </div>
            )}

            <div className="menu-form-actions">
              <button className="btn-dashboard" type="submit" disabled={saving}>
                {saving ? "A gravar..." : editingId ? "Guardar alteracoes" : "Criar prato"}
              </button>
              {editingId && <button className="btn-dashboard secondary" type="button" onClick={resetForm}>Cancelar edicao</button>}
            </div>
          </form>

          <div className="menu-category-inline">
            <h3>Gestao de categorias</h3>
            <p className="muted" style={{ marginBottom: 10 }}>Cria, edita e remove categorias apenas desta loja.</p>
            <div className="menu-category-creator">
              <span className="muted">Criar nova categoria</span>
              <div className="menu-category-creator-row">
                <input type="text" placeholder="Ex: Francesinhas" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                <button className="btn-dashboard small" type="button" onClick={handleCreateCategory} disabled={creatingCategory || saving || !scopedLoja}>
                  {creatingCategory ? "A criar..." : "Criar categoria"}
                </button>
              </div>
            </div>
            <div className="menu-category-collapse">
              <button className="btn-dashboard secondary small" type="button" onClick={() => setCategoriesExpanded((prev) => !prev)}>
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
                            <input type="text" value={categoryEditName} onChange={(e) => setCategoryEditName(e.target.value)} disabled={rowBusy} />
                          ) : (
                            <strong>{option.label}</strong>
                          )}

                          <div className="menu-category-item-actions">
                            {editingCategory ? (
                              <>
                                <button className="btn-dashboard small" type="button" disabled={rowBusy} onClick={() => handleSaveCategory(option.value)}>
                                  {rowBusy ? "A guardar..." : "Guardar"}
                                </button>
                                <button className="btn-dashboard small secondary" type="button" disabled={rowBusy} onClick={cancelCategoryEdit}>Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button className="btn-dashboard small" type="button" disabled={rowBusy || saving} onClick={() => startCategoryEdit(option)}>Editar</button>
                                <button className="btn-dashboard small secondary" type="button" disabled={rowBusy || saving} onClick={() => handleDeleteCategory(option)}>
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
                const linkedGroupsCount = Array.isArray(item.menu_option_group_ids)
                  ? item.menu_option_group_ids.length
                  : Array.isArray(item.linked_option_groups) ? item.linked_option_groups.length : 0;

                return (
                  <article className="menu-card" key={item.idmenu}>
                    <div className="menu-card-media">
                      {item.imagem ? <img src={item.imagem} alt={item.nome} /> : <div className="menu-card-placeholder">Sem imagem</div>}
                      <span className={item.ativo !== false ? "tag ok" : "tag warn"}>{item.ativo !== false ? "Disponivel" : "Esgotado"}</span>
                      <span className={`tag soft menu-card-visibility-tag ${item.visivel !== false ? "" : "warn"}`}>{item.visivel !== false ? "Visivel" : "Oculto"}</span>
                    </div>
                    <div className="menu-card-body">
                      <h4>{item.nome}</h4>
                      <p className="muted menu-card-desc">{item.desc || "Sem descricao"}</p>
                      {missingDetails && <p className="menu-card-hint">Completa descricao e imagem para melhorar o card na pagina de lojas.</p>}
                      <div className="menu-card-meta menu-card-meta-stack">
                        <span>{tipoNome}</span>
                        <span>{linkedGroupsCount} grupos de opcoes</span>
                        <strong>{formatCurrency(item.preco)}</strong>
                      </div>
                      <div className="menu-card-actions">
                        <button className="btn-dashboard small" type="button" onClick={() => startEdit(item)}>{missingDetails ? "Completar dados" : "Editar"}</button>
                        <button className="btn-dashboard small" type="button" onClick={() => openModifierManager(item)}>Gerir opcoes</button>
                        <button className="btn-dashboard small secondary" type="button" onClick={() => handleToggle(item)}>{item.ativo !== false ? "Marcar esgotado" : "Marcar disponivel"}</button>
                        <button className="btn-dashboard small secondary" type="button" onClick={() => handleToggleVisibility(item)}>{item.visivel !== false ? "Esconder prato" : "Mostrar na app"}</button>
                        <button className="btn-dashboard small secondary" type="button" onClick={() => handleDelete(item.idmenu, item.nome)}>Apagar</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </>
  );

  const renderLibraryTab = () => (
    <section className="panel-grid analytics-grid menu-library-layout">
      <article className="panel">
        <div className="menu-library-list-head">
          <div>
            <p className="kicker">Biblioteca de extras</p>
            <h3>{libraryEditingId ? "Editar grupo global" : "Novo grupo global"}</h3>
            <p className="muted">Cria uma vez e reutiliza em varios pratos.</p>
          </div>
          {libraryEditingId && <button className="btn-dashboard secondary small" type="button" onClick={resetLibraryForm}>Criar novo grupo</button>}
        </div>

        <form className="menu-form" onSubmit={handleSaveLibraryGroup}>
          <label>
            <span className="muted">Titulo do grupo</span>
            <input type="text" placeholder="Ex: Escolha o seu molho" value={libraryForm.title} onChange={(e) => patchLibraryForm({ title: e.target.value })} required />
          </label>

          <div className="menu-form-row">
            <label>
              <span className="muted">Tipo</span>
              <select value={libraryForm.type} onChange={(e) => patchLibraryForm({ type: e.target.value })}>
                {LIBRARY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label>
              <span className="muted">Maximo de selecoes</span>
              <input type="number" min="1" step="1" value={libraryForm.maxSelections} onChange={(e) => patchLibraryForm({ maxSelections: e.target.value })} />
            </label>
          </div>

          <label className="menu-form-checkbox">
            <input type="checkbox" checked={libraryForm.required} onChange={(e) => patchLibraryForm({ required: e.target.checked })} />
            <span className="menu-form-checkbox-box">
              <strong>Grupo obrigatorio</strong>
              <small className="muted">{describeMenuOptionSelectionMode(libraryForm)}</small>
            </span>
          </label>

          <div className="menu-options-builder">
            <div className="menu-options-builder-head">
              <div>
                <h4>Itens do grupo</h4>
                <p className="menu-builder-caption muted">Exemplos: Ketchup, Maionese, Batata frita.</p>
              </div>
              <button className="btn-dashboard secondary small" type="button" onClick={handleAddLibraryOption}>Adicionar item</button>
            </div>

            <div className="menu-option-builder-list">
              {libraryForm.options.map((option, index) => (
                <div className="menu-option-builder-row" key={option.id}>
                  <label>
                    <span className="muted">Nome do item</span>
                    <input type="text" placeholder={`Item ${index + 1}`} value={option.name} onChange={(e) => handleUpdateLibraryOption(option.id, { name: e.target.value })} />
                  </label>

                  <label>
                    <span className="muted">Preco extra</span>
                    <input type="number" step="0.01" min="0" value={option.price} onChange={(e) => handleUpdateLibraryOption(option.id, { price: e.target.value })} />
                  </label>

                  <label className="menu-form-checkbox">
                    <input type="checkbox" checked={option.defaultSelected} onChange={(e) => handleUpdateLibraryOption(option.id, { defaultSelected: e.target.checked })} />
                    <span className="menu-form-checkbox-box">
                      <strong>Pre-selecionado</strong>
                      <small className="muted">Opcao sugerida por defeito.</small>
                    </span>
                  </label>

                  <div className="menu-option-builder-actions">
                    <button
                      className="btn-dashboard secondary small"
                      type="button"
                      onClick={() => handleMoveLibraryOption(option.id, "up")}
                      disabled={index === 0}
                      title="Mover item para cima"
                    >
                      Subir
                    </button>
                    <button
                      className="btn-dashboard secondary small"
                      type="button"
                      onClick={() => handleMoveLibraryOption(option.id, "down")}
                      disabled={index >= libraryForm.options.length - 1}
                      title="Mover item para baixo"
                    >
                      Descer
                    </button>
                    <button className="btn-dashboard secondary small" type="button" onClick={() => handleRemoveLibraryOption(option.id)}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="menu-form-actions">
            <button className="btn-dashboard" type="submit" disabled={librarySaving}>{librarySaving ? "A gravar..." : libraryEditingId ? "Guardar grupo" : "Criar grupo"}</button>
            {libraryEditingId && <button className="btn-dashboard secondary" type="button" onClick={resetLibraryForm}>Cancelar edicao</button>}
          </div>
        </form>
      </article>

      <article className="panel">
        <div className="menu-library-list-head">
          <div>
            <p className="kicker">Grupos reutilizaveis</p>
            <h3>Biblioteca atual</h3>
            <p className="muted">Associa estes grupos aos pratos na aba "Categorias e pratos".</p>
          </div>
          <div className="menu-library-order-controls">
            <span className="menu-library-count">{orderedLibraryGroups.length} grupos</span>
            <button
              className="btn-dashboard secondary small"
              type="button"
              onClick={handleResetLibraryGroupOrder}
              disabled={!libraryGroupOrderDirty || librarySaving || libraryOrdering}
            >
              Repor ordem
            </button>
            <button
              className="btn-dashboard small"
              type="button"
              onClick={handleSaveLibraryGroupOrder}
              disabled={!libraryGroupOrderDirty || librarySaving || libraryOrdering}
            >
              {libraryOrdering ? "A guardar..." : "Guardar ordem"}
            </button>
          </div>
        </div>

        {libraryLoading ? (
          <p className="muted">A carregar biblioteca...</p>
        ) : orderedLibraryGroups.length === 0 ? (
          <p className="muted">Ainda nao existem grupos globais para esta loja.</p>
        ) : (
          <div className="menu-library-list">
            {orderedLibraryGroups.map((group) => {
              const groupId = group.library_group_id || group.id;
              const position = orderedLibraryGroups.findIndex((entry) => String(getLibraryGroupKey(entry)) === String(getLibraryGroupKey(group)));
              const orderLabel = position >= 0 ? position + 1 : "?";
              const canMoveUp = position > 0;
              const canMoveDown = position >= 0 && position < orderedLibraryGroups.length - 1;

              return (
                <article className="menu-library-card" key={groupId}>
                  <div className="menu-library-card-head">
                    <div>
                      <h4>{group.title}</h4>
                      <p className="muted">{getMenuOptionTypeLabel(group.type)} - {describeMenuOptionSelectionMode(group)}</p>
                    </div>
                    <div className="menu-option-group-order-controls">
                      <span className="menu-library-count">#{orderLabel} - {group.linked_menu_count || 0} pratos</span>
                      <div className="menu-option-group-order-buttons">
                        <button
                          className="btn-dashboard secondary small"
                          type="button"
                          onClick={() => handleMoveLibraryGroup(group, "up")}
                          disabled={!canMoveUp || librarySaving || libraryOrdering}
                          title="Mover grupo para cima"
                        >
                          Subir
                        </button>
                        <button
                          className="btn-dashboard secondary small"
                          type="button"
                          onClick={() => handleMoveLibraryGroup(group, "down")}
                          disabled={!canMoveDown || librarySaving || libraryOrdering}
                          title="Mover grupo para baixo"
                        >
                          Descer
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="menu-library-card-items">
                    {(group.options || []).map((option) => (
                      <div className="menu-library-card-item" key={option.id}>
                        <span>{option.name}</span>
                        <strong>{option.price > 0 ? `+${formatCurrency(option.price)}` : "Sem extra"}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="menu-card-actions">
                    <button className="btn-dashboard small" type="button" onClick={() => startEditLibraryGroup(group)}>Editar grupo</button>
                    <button
                      className="btn-dashboard small secondary"
                      type="button"
                      onClick={() => handleDuplicateLibraryGroup(group)}
                      disabled={librarySaving || libraryOrdering}
                    >
                      Duplicar
                    </button>
                    <button className="btn-dashboard small secondary" type="button" onClick={() => handleDeleteLibraryGroup(group)}>Apagar grupo</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );

  return (
    <div className="dashboard-shell enterprise menu-manager-shell">
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
                <input type="text" placeholder="Nome do restaurante" value={adminStoreSearch} onChange={(e) => setAdminStoreSearch(e.target.value)} />
              </label>
              <label>
                <span className="muted">Restaurante</span>
                <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} disabled={!filteredAdminStores.length}>
                  {filteredAdminStores.length === 0 ? (
                    <option value="">Sem restaurantes</option>
                  ) : (
                    filteredAdminStores.map((store) => <option key={store.idloja} value={String(store.idloja)}>{store.nome}</option>)
                  )}
                </select>
              </label>
            </div>
          )}

          <div className="menu-header-buttons">
            <button className="btn-dashboard secondary small" type="button" onClick={goToDashboard}>Voltar ao dashboard</button>
            <button className="btn-dashboard small" type="button" onClick={goToWebsite}>Inicio</button>
            <button className="btn-dashboard small" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <section className="dashboard-grid premium-grid">
        <article className="metric-card premium"><div className="metric-label">Pratos no catalogo</div><div className="metric-value">{stats.total}</div></article>
        <article className="metric-card premium"><div className="metric-label">Disponiveis</div><div className="metric-value">{stats.active}</div></article>
        <article className="metric-card premium"><div className="metric-label">Esgotados</div><div className="metric-value">{stats.soldOut}</div></article>
        <article className="metric-card premium"><div className="metric-label">A mostrar</div><div className="metric-value">{filteredStats.visible}</div><div className="metric-foot">{filteredStats.visibleActive} disponiveis com filtro atual</div></article>
        <article className="metric-card premium"><div className="metric-label">Ocultos na app</div><div className="metric-value">{stats.hidden}</div><div className="metric-foot">Pratos escondidos do cliente mas mantidos no catalogo</div></article>
      </section>

      {error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</p>}

      <section className="panel menu-manager-tabs-panel">
        <div className="menu-manager-tabs">
          <button type="button" className={`menu-manager-tab ${activeTab === MENU_MANAGER_TABS.CATALOG ? "is-active" : ""}`} onClick={() => setActiveTab(MENU_MANAGER_TABS.CATALOG)}>Categorias e pratos</button>
          <button type="button" className={`menu-manager-tab ${activeTab === MENU_MANAGER_TABS.LIBRARY ? "is-active" : ""}`} onClick={() => setActiveTab(MENU_MANAGER_TABS.LIBRARY)}>Biblioteca de extras</button>
        </div>
      </section>

      {activeTab === MENU_MANAGER_TABS.CATALOG ? renderCatalogTab() : renderLibraryTab()}

      <MenuOptionBuilderModal
        isOpen={Boolean(modifierManagerTarget)}
        lojaId={scopedLoja}
        menuItem={activeModifierMenuItem}
        onClose={closeModifierManager}
        onSaved={handleModifierManagerSaved}
      />
    </div>
  );
}

