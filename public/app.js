const state = {
  index: null,
  latest: null,
  releases: new Map(),
  scope: 'current',
  query: '',
  relationship: 'all',
  region: 'all'
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const formatDate = (value) => value ? new Intl.DateTimeFormat('ar-FR', { year:'numeric', month:'long', day:'numeric' }).format(new Date(`${value}T12:00:00`)) : '—';
const flattenCompanies = () => [...state.releases.values()].flatMap((release) => (release.companies || []).map((company) => ({ ...company, releaseId: release.id, releaseLabel: release.label, releaseDate: release.as_of })));

async function loadJson(path) {
  const response = await fetch(`./${path.replace(/^\//, '')}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`تعذر تحميل ${path}`);
  return response.json();
}

async function boot() {
  try {
    state.index = await loadJson('data/releases/index.json');
    const releasePayloads = await Promise.all((state.index.releases || []).map(async (release) => [release.id, await loadJson(`data/releases/${release.id}/release.json`)]));
    releasePayloads.forEach(([id, release]) => state.releases.set(id, release));
    state.latest = state.releases.get(state.index.latest) || releasePayloads.at(-1)?.[1] || { companies: [] };
    fillRegions();
    renderShell();
    renderResults();
    bindControls();
  } catch (error) {
    byId('results-list').innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>تعذر تحميل الإصدار</h3><p>${escapeHtml(error.message)}. جرّب إعادة تحميل الصفحة.</p></div>`;
  }
}

function fillRegions() {
  const regions = [...new Set(flattenCompanies().map((company) => company.location?.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  byId('region-filter').innerHTML = '<option value="all">كل المناطق</option>' + regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join('');
}

function renderShell() {
  const companies = state.latest.companies || [];
  const previous = flattenCompanies().filter((company) => company.status === 'previous').length;
  const sourceCount = companies.reduce((total, company) => total + (company.evidence?.length || 0), 0);
  byId('hero-release-date').textContent = state.latest.as_of || '—';
  byId('hero-release-label').textContent = state.latest.label || 'إصدار مؤرخ';
  byId('stat-total').textContent = companies.length.toLocaleString('ar-FR');
  byId('stat-current').textContent = companies.filter((company) => company.status !== 'previous').length.toLocaleString('ar-FR');
  byId('stat-previous').textContent = previous.toLocaleString('ar-FR');
  byId('stat-sources').textContent = sourceCount.toLocaleString('ar-FR');
  byId('last-updated-date').textContent = formatDate(state.latest.as_of);
}

function filteredCompanies() {
  const source = state.scope === 'current' ? (state.latest.companies || []).map((company) => ({ ...company, releaseId: state.latest.id, releaseLabel: state.latest.label, releaseDate: state.latest.as_of })) : flattenCompanies();
  const query = state.query.trim().toLocaleLowerCase('ar');
  return source.filter((company) => {
    const haystack = [company.name, company.siren, company.location?.city, company.location?.region, company.activity].filter(Boolean).join(' ').toLocaleLowerCase('ar');
    const matchQuery = !query || haystack.includes(query);
    const matchRelationship = state.relationship === 'all' || (company.relationships || []).some((item) => item.type === state.relationship);
    const matchRegion = state.region === 'all' || company.location?.region === state.region;
    return matchQuery && matchRelationship && matchRegion;
  });
}

function relationshipLabel(type) {
  return ({ owner:'ملكية جزائرية موثقة', manager:'إدارة جزائرية موثقة', founder:'تأسيس من مهاجر جزائري' })[type] || type || 'ارتباط موثق';
}

function renderResults() {
  const results = filteredCompanies();
  const scopeText = state.scope === 'current' ? 'في الإصدار الحالي' : 'عبر الإصدارات المحفوظة';
  byId('results-count').textContent = `${results.length.toLocaleString('ar-FR')} نتيجة ${scopeText}`;
  const list = byId('results-list');
  if (!results.length) {
    const noData = state.latest.companies?.length === 0 && !state.query && state.scope === 'current';
    list.innerHTML = noData
      ? '<div class="empty-state"><div class="empty-icon">⌁</div><h3>لم تُعتمد نتائج بعد</h3><p>هذا الإصدار يحفظ البنية والمنهجية قبل إضافة الشركات. لن تظهر أي شركة هنا إلا بعد اعتماد دليل يحقق معيار الثقة العالية.</p><a href="./methodology.html">اقرأ قواعد الإدراج ←</a></div>'
      : '<div class="empty-state"><div class="empty-icon">⌕</div><h3>لا توجد نتائج مطابقة</h3><p>جرّب تغيير البحث أو الفلاتر. الشركات التي انتهت أهليتها تظهر عند اختيار «كل الإصدارات».</p></div>';
    return;
  }
  list.innerHTML = results.map(renderCompany).join('');
}

function renderCompany(company) {
  const relationship = company.relationships?.[0];
  const isPrevious = company.status === 'previous';
  const evidence = company.evidence?.[0];
  return `<article class="company-card">
    <div><span class="company-badge">${isPrevious ? 'مؤهلة سابقاً' : 'ثقة عالية'}</span><h3 class="company-name">${escapeHtml(company.name)}</h3><div class="company-meta">${escapeHtml(company.siren || 'SIREN غير متاح')} · ${escapeHtml(company.location?.city || 'فرنسا')}</div></div>
    <div class="company-evidence"><strong>${escapeHtml(relationshipLabel(relationship?.type))}</strong><br />${escapeHtml(evidence?.summary || company.activity || 'دليل موثق محفوظ في هذا الإصدار.')}</div>
    <a class="company-open" href="${escapeHtml(evidence?.url || '#')}" target="_blank" rel="noreferrer">فتح المصدر ↗</a>
  </article>`;
}

function bindControls() {
  byId('search-input').addEventListener('input', (event) => { state.query = event.target.value; renderResults(); });
  byId('relationship-filter').addEventListener('change', (event) => { state.relationship = event.target.value; renderResults(); });
  byId('region-filter').addEventListener('change', (event) => { state.region = event.target.value; renderResults(); });
  document.querySelectorAll('.toggle-button').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.toggle-button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    state.scope = button.dataset.scope;
    renderResults();
  }));
}

if (byId('results-list')) boot();
