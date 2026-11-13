/* ==================================================
   KANZAK — Application Engine | Version 1.1
   ================================================== */

"use strict";

(() => {

  /* 1. Config */

  const WHATSAPP_NUMBER = "249998607716"; // بصيغة دولية بدون + (السودان 249)
  const PHONE = "0998607716";

  /* 2. Helpers */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")   // التشكيل والتطويل
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d))
      .replace(/\s+/g, " ")
      .trim();
  }

  function toArray(value) {
    if (value === undefined || value === null || value === "") return [];
    return Array.isArray(value) ? value : [value];
  }

  function isEmpty(value) {
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.every(isEmpty);
    if (typeof value === "object") return Object.values(value).every(isEmpty);
    return false;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* 3. State */

  const state = {
    currentUser: null,
    isAdmin: false,
    sections: [],
    branches: [],
    materials: [],
    currentView: "home",
    ready: false,
    currentSection: null,
    branchFilter: "",
    searchQuery: ""
  };

  const views = {
    home: "view-home",
    sections: "view-sections",
    section: "view-materials",
    material: "view-material",
    search: "view-search",
    register: "view-register",
    login: "view-login",
    "verify-phone": "view-verify-phone",
    subscription: "view-subscription",
    contact: "view-contact",
    admin: "view-admin",
    "admin-sections": "view-admin-sections",
    "admin-branches": "view-admin-branches",
    "admin-materials": "view-admin-materials",
    "admin-material-edit": "view-admin-material-edit",
    "admin-users": "view-admin-users",
    "admin-trials": "view-admin-trials",
    "admin-requests": "view-admin-requests",
    "admin-logs": "view-admin-logs"
  };

  const menu = $("#app-menu");
  const menuButton = $("#btn-menu");
  const backButton = $("#btn-back");

  /* 4. Notifications and states */

  let toastTimer;

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  function hideStates() {
    $("#state-loading").hidden = true;
    $("#state-error").hidden = true;
    $("#state-empty").hidden = true;
  }

  function hideAllViews() {
    Object.values(views).forEach(id => {
      const node = document.getElementById(id);
      if (node) node.hidden = true;
    });
  }

  function showLoading() {
    hideStates();
    hideAllViews();
    $("#state-loading").hidden = false;
  }

  function showError(message) {
    hideStates();
    hideAllViews();
    $("#state-error-text").textContent = message;
    $("#state-error").hidden = false;
  }

  function showEmpty(message) {
    hideStates();
    hideAllViews();
    $("#state-empty-text").textContent = message;
    $("#state-empty").hidden = false;
  }

  /* 5. Data loading and validation */

  const SECTIONS_FILE = "data/sections.json";
  const BRANCHES_FILE = "data/branches.json";

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(url + " (" + response.status + ")");
    return response.json();
  }

  function validateData() {
    const warnings = [];
    const sectionIds = new Set(state.sections.map(s => String(s.id)));
    const branchById = new Map(state.branches.map(b => [String(b.id), b]));
    const seen = new Set();

    state.branches.forEach(b => {
      if (!sectionIds.has(String(b.section_id)))
        warnings.push("فرع بقسم غير موجود: " + b.id);
      if (!b.file) warnings.push("فرع بدون ملف: " + b.id);
    });

    state.materials.forEach((m, i) => {
      const id = String(m.id ?? "");
      const branch = branchById.get(String(m.branch_id));

      if (!id) warnings.push("مادة بدون id (رقم " + (i + 1) + ")");
      else if (seen.has(id)) warnings.push("id مكرر: " + id);
      seen.add(id);

      if (!m.name_ar) warnings.push("مادة بدون اسم عربي: " + id);
      if (!branch) warnings.push("مادة بفرع غير موجود: " + id);
      else if (branch.id_prefix && !id.startsWith(branch.id_prefix + "-"))
        warnings.push("id لا يطابق بادئة الفرع (" + branch.id_prefix + "-): " + id);
    });

    return warnings;
  }

  function buildSearchIndex() {
    state.materials.forEach(m => {
      m._names = [m.name_ar, m.name_en, m.chemical_name, ...toArray(m.aliases)]
        .map(normalize).filter(Boolean);
      m._codes = [m.cas, m.inci].map(normalize).filter(Boolean);
    });
  }

  async function loadData() {
    const [sections, branches] = await Promise.all([
      fetchJSON(SECTIONS_FILE),
      fetchJSON(BRANCHES_FILE)
    ]);
    state.sections = sections;
    state.branches = branches;

    // ملف لكل فرع؛ فشل ملف واحد لا يوقف التطبيق
    const results = await Promise.allSettled(
      branches.map(b => b.file ? fetchJSON(b.file) : Promise.resolve([]))
    );

    const warnings = [];
    state.materials = [];

    results.forEach((result, index) => {
      const branch = branches[index];
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        result.value.forEach(material => {
          if (!material.branch_id) material.branch_id = branch.id;
          if (String(material.branch_id) !== String(branch.id))
            warnings.push("مادة في ملف فرع آخر: " + material.id);
          state.materials.push(material);
        });
      } else {
        warnings.push("تعذر تحميل ملف الفرع: " + branch.file);
      }
    });

    state.dataWarnings = warnings.concat(validateData());
    state.dataWarnings.forEach(w => console.warn("[KANZAK data]", w));
    buildSearchIndex();
  }

  /* 6. Routing */

  function parseRoute() {
    const parts = location.hash
      .replace(/^#\/?/, "")
      .split("/")
      .filter(Boolean)
      .map(part => {
        try { return decodeURIComponent(part); } catch { return part; }
      });

    let page = parts[0] || "home";
    let id = parts[1] || null;

    if (page === "admin" && id) {
      page = "admin-" + id;
      id = parts[2] || null;
    }
    return { page, id };
  }

  function navigate(route) {
    location.hash = "#/" + route;
  }

  const findBranch = id => state.branches.find(b => String(b.id) === String(id));
  const findSection = id => state.sections.find(s => String(s.id) === String(id));
  const findMaterial = id => state.materials.find(m => String(m.id) === String(id));

  function parentRoute() {
    const { page, id } = parseRoute();
    if (page === "material") {
      const m = findMaterial(id);
      const b = m && findBranch(m.branch_id);
      return b ? "section/" + encodeURIComponent(b.section_id) : "home";
    }
    if (page.startsWith("admin-")) return "admin";
    return "home";
  }

  const renderers = {
    home: renderSections,
    sections: renderSections,
    section: renderSection,
    contact: renderContact,
    material: renderMaterial,
    search: renderSearch,
    subscription: renderSubscription,
    admin: renderAdmin
  };

  function renderRoute() {
    if (!state.ready) return;
    let { page, id } = parseRoute();

    if (!views[page]) page = "home";

    if (page.startsWith("admin") && !state.isAdmin) {
      page = "login";
      history.replaceState(null, "", "#/login");
    }

    hideStates();
    hideAllViews();

    // المُعرِض يعيد نصاً عند عدم وجود العنصر المطلوب
    const problem = renderers[page] ? renderers[page](id) : null;

    if (typeof problem === "string") {
      showEmpty(problem);
    } else {
      document.getElementById(views[page]).hidden = false;
    }

    state.currentView = page;
    const tabOf = { home: "home", sections: "home", section: "home", material: "home",
      search: "search", subscription: "subscription", contact: "contact" };
    $$("#tabbar a").forEach(a => a.classList.toggle("active", a.dataset.tab === tabOf[page]));
    backButton.hidden = page === "home";
    closeMenu();
    updateMenu();
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", renderRoute);

  /* 7. Menu */

  function closeMenu() {
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  }

  menuButton.addEventListener("click", event => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
    menuButton.setAttribute("aria-expanded", String(!menu.hidden));
  });

  document.addEventListener("click", event => {
    if (!menu.hidden && !menu.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });

  backButton.addEventListener("click", () => navigate(parentRoute()));

  function updateMenu() {
    $$("[data-guest-only]").forEach(n => { n.hidden = !!state.currentUser; });
    $$("[data-user-only]").forEach(n => { n.hidden = !state.currentUser; });
    $$("[data-admin-only]").forEach(n => { n.hidden = !state.isAdmin; });
  }

  /* 8. Cards */

  const SECTION_ICONS = {
    "oils-fats": "🫒", "waxes-emulsifiers": "🕯️", "surfactants": "🧼",
    "emollients-humectants": "💧", "thickeners-stabilizers": "🧪", "actives": "✨",
    "botanical-extracts": "🌿", "preservatives": "🛡️", "solvents-ph": "⚗️",
    "colorants": "🎨", "clays-exfoliants": "🏺", "sunscreens": "☀️",
    "fragrance-flavor": "🌸"
  };

  function createCard(title, description, href, opts = {}) {
    const card = el("a", "card");
    card.href = href;

    const text = el("span", "card-text");
    text.append(el("h3", "", title || ""));
    if (description) text.append(el("p", "", description));
    if (opts.meta) text.append(el("small", "card-meta", opts.meta));

    card.append(
      el("span", "card-icon", opts.icon || "🔹"),
      text,
      el("span", "card-arrow", "‹")
    );
    return card;
  }

  const countMaterialsInBranch = id =>
    state.materials.filter(m => String(m.branch_id) === String(id)).length;

  const countMaterialsInSection = id => {
    const ids = new Set(
      state.branches.filter(b => String(b.section_id) === String(id)).map(b => String(b.id))
    );
    return state.materials.filter(m => ids.has(String(m.branch_id))).length;
  };

  /* 9. Sections (بلاطات الأقسام) */

  function createTile(section) {
    const tile = el("a", "tile");
    tile.href = "#/section/" + encodeURIComponent(section.id);
    const sub = el("p", "tile-sub",
      [section.name_en, countMaterialsInSection(section.id)]
        .filter(v => v !== undefined && v !== "").join(" · "));
    sub.dir = "ltr";
    tile.append(el("span", "tile-icon", SECTION_ICONS[section.id] || "🔹"),
                el("h3", "", section.name), sub);
    return tile;
  }

  function renderSections() {
    ["#home-sections-grid", "#sections-grid"].forEach(selector => {
      const container = $(selector);
      container.replaceChildren();
      state.sections.forEach(section => container.appendChild(createTile(section)));
      if (!state.sections.length) {
        container.appendChild(el("p", "muted", "سيتم عرض الأقسام بعد إضافة البيانات."));
      }
    });
  }

  /* 10. مواد القسم (قسم ثم مادة مباشرة) */

  function updateMaterialsList() {
    const sectionId = state.currentSection;
    const container = $("#materials-list");
    container.replaceChildren();

    let items = state.materials.filter(m => {
      const b = findBranch(m.branch_id);
      return b && String(b.section_id) === String(sectionId);
    });

    if (state.branchFilter) {
      items = items.filter(m => String(m.branch_id) === String(state.branchFilter));
    }

    const filter = normalize($("#materials-filter").value);
    if (filter) {
      items = items.filter(m =>
        normalize([m.name_ar, m.name_en, ...toArray(m.aliases)].join(" ")).includes(filter)
      );
    }

    const field = $("#materials-sort").value === "en" ? "name_en" : "name_ar";
    const locale = field === "name_en" ? "en" : "ar";
    items.sort((a, b) => String(a[field] || "").localeCompare(String(b[field] || ""), locale));

    $("#materials-count").textContent = items.length + " مادة";
    const showId = $("#materials-show-ids").checked;

    items.forEach(material => {
      const branch = findBranch(material.branch_id);
      const meta = [branch && branch.name, showId ? "ID: " + material.id : ""]
        .filter(Boolean).join(" · ");
      container.appendChild(createCard(
        material.name_ar,
        material.name_en,
        "#/material/" + encodeURIComponent(material.id),
        { icon: SECTION_ICONS[sectionId] || "🧴", meta }
      ));
    });

    if (!items.length) {
      container.appendChild(el("p", "muted",
        filter ? "لا توجد مواد مطابقة." : "لم تُضف مواد في هذا القسم بعد."));
    }
  }

  // أزرار تصفية حسب النوع (الفرع) داخل القسم، تظهر فقط لو فيه أكثر من نوع
  function renderBranchChips(sectionId) {
    const box = $("#branch-filter");
    box.replaceChildren();

    const groups = state.branches
      .filter(b => String(b.section_id) === String(sectionId))
      .map(b => ({ branch: b, n: countMaterialsInBranch(b.id) }))
      .filter(g => g.n > 0);

    if (groups.length < 2) {
      state.branchFilter = "";
      box.hidden = true;
      return;
    }

    const add = (id, label) => {
      const active = String(state.branchFilter) === String(id);
      const btn = el("button", "chip-btn" + (active ? " active" : ""), label);
      btn.type = "button";
      btn.addEventListener("click", () => {
        state.branchFilter = id;
        renderBranchChips(sectionId);
        updateMaterialsList();
      });
      box.appendChild(btn);
    };

    add("", "الكل (" + groups.reduce((sum, g) => sum + g.n, 0) + ")");
    groups.forEach(g => add(g.branch.id, g.branch.name + " (" + g.n + ")"));
    box.hidden = false;
  }

  function renderSection(sectionId) {
    const section = findSection(sectionId);
    if (!section) return "القسم غير موجود.";

    if (String(state.currentSection) !== String(sectionId)) {
      $("#materials-filter").value = "";
      state.branchFilter = "";
    }
    state.currentSection = sectionId;
    renderBranchChips(sectionId);

    $("#materials-title").textContent =
      (SECTION_ICONS[sectionId] ? SECTION_ICONS[sectionId] + " " : "") + section.name;
    updateMaterialsList();
  }

  $("#materials-filter").addEventListener("input", updateMaterialsList);
  $("#materials-sort").addEventListener("change", updateMaterialsList);
  $("#materials-show-ids").addEventListener("change", updateMaterialsList);

  /* 12. Scientific material file */

  const materialFields = [
    "chemical_name", "aliases", "definition", "botanical_source", "part_used", "extraction", "composition",
    "properties", "functions", "usage_levels", "solubility", "ph",
    "compatibility", "incompatibility", "processing", "storage",
    "safety", "references"
  ];

  // نص عادي مع تحويل الروابط (http/https فقط) إلى روابط آمنة
  function appendText(parent, text, linkify) {
    const value = String(text);
    if (!linkify) {
      parent.append(document.createTextNode(value));
      return;
    }
    value.split(/(https?:\/\/[^\s]+)/g).forEach(part => {
      if (/^https?:\/\//.test(part)) {
        const a = el("a", "", part);
        a.href = part;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        parent.append(a);
      } else if (part) {
        parent.append(document.createTextNode(part));
      }
    });
  }

  function renderValue(body, value, linkify) {
    body.replaceChildren();

    if (Array.isArray(value)) {
      const list = el("ul");
      value.filter(v => !isEmpty(v)).forEach(item => {
        const li = el("li");
        if (item && typeof item === "object") renderValue(li, item, linkify);
        else appendText(li, item, linkify);
        list.appendChild(li);
      });
      body.appendChild(list);
      return;
    }

    if (value && typeof value === "object") {
      const dl = el("dl", "kv");
      Object.entries(value).filter(([, v]) => !isEmpty(v)).forEach(([key, val]) => {
        dl.appendChild(el("dt", "", key));
        const dd = el("dd");
        if (typeof val === "object") renderValue(dd, val, linkify);
        else appendText(dd, val, linkify);
        dl.appendChild(dd);
      });
      body.appendChild(dl);
      return;
    }

    String(value).split(/\n+/).forEach(line => {
      if (!line.trim()) return;
      const p = el("p");
      appendText(p, line, linkify);
      body.appendChild(p);
    });
  }

  function renderMaterial(materialId) {
    const material = findMaterial(materialId);
    if (!material) return "المادة غير موجودة.";

    $("#m-name-ar").textContent = material.name_ar || "";
    $("#m-name-en").textContent = material.name_en || "";

    // روابط القسم والفرع
    const links = $("#m-sections-links");
    links.replaceChildren();
    const branch = findBranch(material.branch_id);
    const section = branch && findSection(branch.section_id);
    if (section) {
      const a = el("a", "", section.name);
      a.href = "#/section/" + encodeURIComponent(section.id);
      links.appendChild(a);
    }
    if (branch) links.appendChild(el("span", "", branch.name));

    materialFields.forEach(field => {
      const block = $(`[data-field="${field}"]`);
      const body = $(".m-body", block);
      const value = material[field];

      block.hidden = isEmpty(value);
      if (block.hidden) {
        body.replaceChildren();
        return;
      }
      renderValue(body, value, field === "references");
    });

    // بطاقات المعلومات السريعة
    const facts = $("#m-facts");
    facts.replaceChildren();
    [["CAS", material.cas, true], ["INCI", material.inci, true]]
      .filter(([, v]) => !isEmpty(v))
      .forEach(([label, value, ltr]) => {
        const box = el("div", "fact");
        const val = el("strong", "fact-v", String(value));
        if (ltr) val.dir = "ltr";
        box.append(el("span", "fact-k", label), val);
        facts.appendChild(box);
      });
    facts.hidden = !facts.children.length;
    $("#m-cas-note").hidden = isEmpty(material.cas);
  }

  /* 13. Search */

  function searchMaterials(query) {
    const q = normalize(query);
    if (!q) return [];

    const results = [];
    state.materials.forEach(m => {
      let score = 0;
      if (m._names.some(n => n === q) || m._codes.some(c => c === q)) score = 3;
      else if (m._names.some(n => n.startsWith(q))) score = 2;
      else if (m._names.some(n => n.includes(q)) || m._codes.some(c => c.includes(q))) score = 1;
      if (score) results.push({ material: m, score });
    });

    return results
      .sort((a, b) => b.score - a.score ||
        String(a.material.name_ar).localeCompare(String(b.material.name_ar), "ar"))
      .map(r => r.material);
  }

  function renderSearch(query) {
    state.searchQuery = (query || "").trim();
    $("#search-page-input").value = state.searchQuery;

    const list = $("#search-results");
    const summary = $("#search-summary");
    list.replaceChildren();

    if (!state.searchQuery) {
      summary.textContent = "اكتب اسم المادة أو رقم CAS أو INCI.";
      return;
    }

    const results = searchMaterials(state.searchQuery);

    summary.textContent = results.length
      ? results.length + " نتيجة بحث"
      : "لا توجد نتائج مطابقة.";

    results.forEach(material => {
      const li = el("li");
      const a = el("a", "", [material.name_ar, material.name_en].filter(Boolean).join(" — "));
      a.href = "#/material/" + encodeURIComponent(material.id);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function submitSearch(value) {
    const q = value.trim();
    navigate(q ? "search/" + encodeURIComponent(q) : "search");
  }

  $("#global-search-form").addEventListener("submit", event => {
    event.preventDefault();
    submitSearch($("#global-search").value);
  });

  $("#search-page-form").addEventListener("submit", event => {
    event.preventDefault();
    submitSearch($("#search-page-input").value);
  });

  /* 14. Accounts (يتطلب خادماً) */

  function backendRequired(event) {
    event.preventDefault();
    showToast("يلزم ربط خادم آمن لتفعيل هذه الخدمة.");
  }

  $("#form-register").addEventListener("submit", backendRequired);
  $("#form-login").addEventListener("submit", backendRequired);
  $("#form-verify").addEventListener("submit", backendRequired);

  $("#btn-resend-code").addEventListener("click", () => {
    showToast("خدمة إرسال رمز التحقق غير مفعّلة.");
  });

  $("#btn-logout").addEventListener("click", () => {
    state.currentUser = null;
    state.isAdmin = false;
    updateMenu();
    navigate("home");
    showToast("تم تسجيل الخروج.");
  });

  /* 15. Subscription */

  function renderSubscription() {
    $("#sub-status-title").textContent = state.currentUser ? "حالة الحساب" : "زائر";
    $("#sub-status-text").textContent = state.currentUser
      ? "تعذر التحقق من حالة الاشتراك دون الخادم."
      : "سجل الدخول أولاً لمعرفة حالة اشتراكك.";
    $("#sub-remaining").textContent = "";
  }

  $("#btn-request-sub").addEventListener("click", () => {
    showToast("خدمة الاشتراكات تحتاج إلى ربط الخادم.");
  });

  $("#btn-renew-sub").addEventListener("click", () => {
    showToast("خدمة التجديد غير مفعّلة.");
  });

  /* 16. Admin (الحماية الفعلية في الخادم فقط) */

  function renderAdmin() {
    const container = $("#admin-stats");
    container.replaceChildren();

    [
      ["الأقسام", state.sections.length],
      ["الفروع", state.branches.length],
      ["المواد", state.materials.length],
      ["تنبيهات البيانات", (state.dataWarnings || []).length]
    ].forEach(([name, count]) => {
      const card = el("div", "info-card");
      card.append(el("h3", "", name), el("p", "", String(count)));
      container.appendChild(card);
    });
  }

  $("#btn-admin-add-material").addEventListener("click", () => {
    navigate("admin/material-edit");
  });

  /* 17. Contacts */

  function setupContacts() {
    $$("[data-whatsapp]").forEach(link => {
      if (/^\d{8,15}$/.test(WHATSAPP_NUMBER)) {
        link.href = "https://wa.me/" + WHATSAPP_NUMBER;
      } else {
        link.addEventListener("click", event => {
          event.preventDefault();
          showToast("أضف رقم واتساب الإدارة لتفعيل الرابط.");
        });
      }
    });
    $$("[data-phone]").forEach(a => { a.href = "tel:" + PHONE; });
    $$("[data-phone-text]").forEach(n => { n.textContent = PHONE; });
  }

  function renderContact() {
    $("#contact-text").textContent =
      "للاستفسار أو طلب الاشتراك تواصل مع الإدارة عبر واتساب أو الاتصال.";
  }

  /* 18. Owner photo fallback */

  $("#owner-photo").addEventListener("error", event => {
    event.target.hidden = true;
  });

  /* 19. Init */

  async function start() {
    showLoading();
    try {
      await loadData();
    } catch (error) {
      console.error(error);
      showError(
        location.protocol === "file:"
          ? "لا يمكن تحميل البيانات من ملف مباشر. شغّل التطبيق عبر خادم محلي (مثال: python -m http.server)."
          : "تعذر تحميل البيانات. تحقق من الاتصال وحاول مجدداً."
      );
      return;
    }
    state.ready = true;
    renderRoute();
  }

  $("#btn-retry").addEventListener("click", start);

  function init() {
    setupContacts();
    updateMenu();
    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

})();
