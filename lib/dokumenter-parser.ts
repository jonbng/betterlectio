// ── Dokumenter page DOM parser ──────────────────────────────────────────
//
// Parses the native Lectio DokumentOversigt.aspx page into typed data
// structures for the BetterLectio DokumenterPage component.

// ── Types ───────────────────────────────────────────────────────────────

export type FolderIcon =
  | 'recent'
  | 'personal'
  | 'hold'
  | 'folder'
  | 'activity'
  | 'materials'
  | 'group';

export interface DocFolder {
  /** lec-node-id, e.g. "S72721772841__5" or "H73099244933__" */
  id: string;
  name: string;
  icon: FolderIcon;
  comment?: string;
  children: DocFolder[];
  depth: number;
  /** Raw hold code for hold-mapping color resolution, e.g. "1x MA" */
  holdCode?: string;
}

export interface DocChangedBy {
  name: string;
  initials: string;
  contextCard: string;
  isTeacher: boolean;
}

export interface DocFile {
  /** documentid from download href */
  id: string;
  name: string;
  /** Lowercase extension without dot, e.g. "pdf", "docx" */
  extension: string;
  comment: string;
  changedBy: DocChangedBy | null;
  date: string;
  size: string;
  editUrl: string;
  downloadUrl: string;
  hasCheckbox: boolean;
}

export interface CurrentFolder {
  label: string;
  iconSrc: string;
  comment: string;
  folderId: string;
}

export interface DokumenterPageData {
  folders: DocFolder[];
  files: DocFile[];
  currentFolder: CurrentFolder;
  /** The selected folder's lec-node-id */
  selectedFolderId: string | null;
  /** Available move-to-folder options from the toolbar dropdown */
  moveTargets: { value: string; label: string }[];
  /** Whether the current folder supports checkboxes (editable folder) */
  hasCheckboxes: boolean;
}

// ── Icon classification helpers ─────────────────────────────────────────

const ICON_MAP: Record<string, FolderIcon> = {
  'newdocsfolder.gif': 'recent',
  'mydocfolder.gif': 'personal',
  'class.auto': 'hold',
  'folder.gif': 'folder',
  'lesson.auto': 'activity',
  'book.auto': 'materials',
};

function classifyFolderIcon(src: string): FolderIcon {
  for (const [fragment, icon] of Object.entries(ICON_MAP)) {
    if (src.includes(fragment)) return icon;
  }
  return 'folder';
}

// ── Folder tree parser ──────────────────────────────────────────────────

function parseFolderNode(
  container: Element,
  depth: number,
): DocFolder | null {
  const nodeId = container.getAttribute('lec-node-id');
  if (!nodeId) return null;

  const titleEl = container.querySelector(
    ':scope > .TreeNode-container .TreeNode-title',
  );
  const iconEl = container.querySelector<HTMLImageElement>(
    ':scope > .TreeNode-container .TreeNode-icon',
  );

  const name = titleEl?.textContent?.trim() ?? '';
  const comment = titleEl?.getAttribute('title') ?? undefined;
  const iconSrc = iconEl?.src ?? '';
  const icon = classifyFolderIcon(iconSrc);

  // Extract hold code for hold-mapping color — hold folder names look like "1x MA", "1g3 da"
  let holdCode: string | undefined;
  if (icon === 'hold') {
    holdCode = name;
  }

  // Parse children from sub-list
  const sublist = container.querySelector(':scope > [lec-role="ltv-sublist"]');
  const children: DocFolder[] = [];
  if (sublist) {
    const childContainers = sublist.querySelectorAll(
      ':scope > [lec-role="treeviewnodecontainer"]',
    );
    for (const child of childContainers) {
      const childFolder = parseFolderNode(child, depth + 1);
      if (childFolder) children.push(childFolder);
    }
  }

  return { id: nodeId, name, icon, comment, children, depth, holdCode };
}

export function parseFolderTree(doc: Document = document): DocFolder[] {
  const treeRoot = doc.getElementById('s_m_Content_Content_FolderTreeView');
  if (!treeRoot) return [];

  const topNodes = treeRoot.querySelectorAll(
    ':scope > [lec-role="treeviewnodecontainer"]',
  );
  const folders: DocFolder[] = [];
  for (const node of topNodes) {
    const folder = parseFolderNode(node, 0);
    if (folder) folders.push(folder);
  }
  return folders;
}

// ── Selected folder detection ───────────────────────────────────────────

export function getSelectedFolderId(doc: Document = document): string | null {
  const selectedNode = doc.querySelector(
    '#s_m_Content_Content_FolderTreeView .selectedFolder',
  );
  if (!selectedNode) return null;

  const container = selectedNode.closest('[lec-role="treeviewnodecontainer"]');
  return container?.getAttribute('lec-node-id') ?? null;
}

// ── Current folder info ─────────────────────────────────────────────────

export function parseCurrentFolder(
  doc: Document = document,
): CurrentFolder {
  const label =
    doc.getElementById('s_m_Content_Content_FolderLabel')?.textContent?.trim() ??
    'Dokumenter';
  const iconImg = doc.getElementById(
    's_m_Content_Content_SelectedFolderIcon',
  ) as HTMLImageElement | null;
  const iconSrc = iconImg?.src ?? '';

  // Folder comment (appears in .infoText under the h1)
  const infoDiv = doc.querySelector(
    '.lectiofilepicker-right .infoText, .ls-lectiofilepicker-container .infoText',
  );
  const comment = infoDiv?.textContent?.trim() ?? '';

  // Extract folderid from URL
  const url = new URL(doc.location?.href ?? window.location.href);
  const folderId = url.searchParams.get('folderid') ?? '';

  return { label, iconSrc, comment, folderId };
}

// ── Document grid parser ────────────────────────────────────────────────

function extractExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx < 0 || dotIdx === filename.length - 1) return '';
  return filename.slice(dotIdx + 1).toLowerCase();
}

function extractDocumentId(href: string): string {
  const match = href.match(/documentid=(\d+)/i) ?? href.match(/dokumentid=(\d+)/i);
  return match?.[1] ?? '';
}

export function parseDocumentGrid(doc: Document = document): {
  files: DocFile[];
  hasCheckboxes: boolean;
} {
  const table = doc.getElementById(
    's_m_Content_Content_DocumentGridView',
  ) as HTMLTableElement | null;
  // Also try the alternate ID pattern Lectio sometimes uses
  const altTable = table ?? doc.getElementById(
    's_m_Content_Content_DocumentGridView_ctl00',
  ) as HTMLTableElement | null;

  if (!altTable) {
    // Check for empty state
    const noRecord = doc.querySelector(
      '#s_m_Content_Content_DocumentGridView .noRecord',
    );
    if (noRecord) return { files: [], hasCheckboxes: false };
    return { files: [], hasCheckboxes: false };
  }

  const rows = altTable.querySelectorAll('tr');
  if (rows.length < 2) return { files: [], hasCheckboxes: false };

  // Detect if header has checkbox column
  const headerRow = rows[0];
  const hasCheckboxes = !!headerRow?.querySelector('input[type="checkbox"]');

  const files: DocFile[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Skip rows that are just the noRecord message
    if (row.querySelector('.noRecord')) continue;

    // Use desktop cells (OnlyDesktop) — they have the structured data
    const desktopCells = row.querySelectorAll('td.OnlyDesktop');
    if (desktopCells.length < 4) {
      // Fallback: try mobile layout
      const mobileCell = row.querySelector('td.OnlyMobile');
      if (mobileCell) {
        const file = parseMobileCell(mobileCell, hasCheckboxes);
        if (file) files.push(file);
      }
      continue;
    }

    const file = parseDesktopRow(desktopCells, hasCheckboxes);
    if (file) files.push(file);
  }

  return { files, hasCheckboxes };
}

function parseDesktopRow(
  cells: NodeListOf<Element>,
  hasCheckboxes: boolean,
): DocFile | null {
  // Column layout depends on whether checkboxes are present:
  // With checkboxes: [0]=checkbox [1]=filename [2]=comment [3]=changed-by [4]=date [5]=size [6]=edit
  // Without checkboxes: [0]=filename [1]=comment [2]=changed-by [3]=date [4]=size [5]=edit
  const offset = hasCheckboxes ? 1 : 0;

  const filenameCell = cells[offset];
  const commentCell = cells[offset + 1];
  const changedByCell = cells[offset + 2];
  const dateCell = cells[offset + 3];
  const sizeCell = cells[offset + 4];
  const editCell = cells[offset + 5];

  if (!filenameCell) return null;

  // Filename + download URL
  const fileLink = filenameCell.querySelector('a[href*="dokumenthent"]');
  if (!fileLink) return null;

  const downloadUrl = (fileLink as HTMLAnchorElement).href;
  const id = extractDocumentId(downloadUrl);
  const name = fileLink.textContent?.trim() ?? '';
  const extension = extractExtension(name);

  // Comment
  const commentSpan = commentCell?.querySelector('span[title]');
  const comment =
    commentSpan?.getAttribute('title') ??
    commentSpan?.textContent?.trim() ??
    commentCell?.textContent?.trim() ??
    '';

  // Changed by
  let changedBy: DocChangedBy | null = null;
  if (changedByCell) {
    const personSpan = changedByCell.querySelector(
      '.prepend-fonticon-teacher, .prepend-fonticon-student',
    );
    if (personSpan) {
      const isTeacher = personSpan.classList.contains('prepend-fonticon-teacher');
      const fullName = personSpan.getAttribute('title') ?? '';
      const initials = personSpan.textContent?.trim() ?? '';
      const contextCard =
        changedByCell
          .closest('[data-lectioContextCard]')
          ?.getAttribute('data-lectioContextCard') ??
        changedByCell.getAttribute('data-lectioContextCard') ??
        '';
      changedBy = { name: fullName, initials, contextCard, isTeacher };
    }
  }

  // Date
  const date = dateCell?.textContent?.trim() ?? '';

  // Size
  const size = sizeCell?.textContent?.trim() ?? '';

  // Edit URL
  const editLink = editCell?.querySelector('a[href*="dokumentrediger"]');
  const editUrl = (editLink as HTMLAnchorElement)?.href ?? '';

  return {
    id,
    name,
    extension,
    comment,
    changedBy,
    date,
    size,
    editUrl,
    downloadUrl,
    hasCheckbox: hasCheckboxes,
  };
}

function parseMobileCell(cell: Element, hasCheckboxes: boolean): DocFile | null {
  const filenameLink = cell.querySelector('a[href*="dokumenthent"]');
  if (!filenameLink) return null;

  const downloadUrl = (filenameLink as HTMLAnchorElement).href;
  const id = extractDocumentId(downloadUrl);
  const name = filenameLink.textContent?.trim() ?? '';
  const extension = extractExtension(name);

  const dateDiv = cell.querySelector('.document-list-datetime');
  const date = dateDiv?.textContent?.trim() ?? '';

  const personSpan = cell.querySelector(
    '.prepend-fonticon-teacher, .prepend-fonticon-student',
  );
  let changedBy: DocChangedBy | null = null;
  if (personSpan) {
    const isTeacher = personSpan.classList.contains('prepend-fonticon-teacher');
    changedBy = {
      name: personSpan.getAttribute('title') ?? '',
      initials: personSpan.textContent?.trim() ?? '',
      contextCard: '',
      isTeacher,
    };
  }

  const editLink = cell.querySelector('a[href*="dokumentrediger"]');
  const editUrl = (editLink as HTMLAnchorElement)?.href ?? '';

  return {
    id,
    name,
    extension,
    comment: '',
    changedBy,
    date,
    size: '',
    editUrl,
    downloadUrl,
    hasCheckbox: hasCheckboxes,
  };
}

// ── Move targets parser ─────────────────────────────────────────────────

export function parseMoveTargets(
  doc: Document = document,
): { value: string; label: string }[] {
  const select = doc.querySelector<HTMLSelectElement>(
    '[name="s$m$Content$Content$FolderSelect$ctl03"]',
  );
  if (!select) return [];

  return Array.from(select.options).map((opt) => ({
    value: opt.value,
    label: opt.textContent?.trim() ?? '',
  }));
}

// ── Full page parser ────────────────────────────────────────────────────

export function parseDokumenterPage(
  doc: Document = document,
): DokumenterPageData {
  const folders = parseFolderTree(doc);
  const { files, hasCheckboxes } = parseDocumentGrid(doc);
  const currentFolder = parseCurrentFolder(doc);
  const selectedFolderId = getSelectedFolderId(doc);
  const moveTargets = parseMoveTargets(doc);

  return {
    folders,
    files,
    currentFolder,
    selectedFolderId,
    moveTargets,
    hasCheckboxes,
  };
}

// ── Subfolder finder ────────────────────────────────────────────────────

/**
 * Find the direct children (subfolders) of the currently selected folder.
 */
/** Walk the folder tree and return the node with the given id, if any. */
export function findFolderById(
  folders: DocFolder[],
  id: string,
): DocFolder | null {
  for (const node of folders) {
    if (node.id === id) return node;
    if (node.children.length > 0) {
      const found = findFolderById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function getSubfoldersOfSelected(
  folders: DocFolder[],
  selectedId: string | null,
): DocFolder[] {
  if (!selectedId) return [];

  function find(nodes: DocFolder[]): DocFolder[] | null {
    for (const node of nodes) {
      if (node.id === selectedId) return node.children;
      if (node.children.length > 0) {
        const result = find(node.children);
        if (result) return result;
      }
    }
    return null;
  }

  return find(folders) ?? [];
}

// ── Breadcrumb builder ──────────────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  folderId: string;
}

/**
 * Build breadcrumb path by walking the folder tree from root to the
 * selected folder.
 */
export function buildBreadcrumbs(
  folders: DocFolder[],
  selectedId: string | null,
): BreadcrumbItem[] {
  if (!selectedId) return [];

  const path: BreadcrumbItem[] = [];

  function walk(nodes: DocFolder[]): boolean {
    for (const node of nodes) {
      path.push({ label: node.name, folderId: node.id });
      if (node.id === selectedId) return true;
      if (node.children.length > 0 && walk(node.children)) return true;
      path.pop();
    }
    return false;
  }

  walk(folders);
  return path;
}

// ── File extension helpers ──────────────────────────────────────────────

export type FileCategory =
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'text'
  | 'other';

const EXT_CATEGORY: Record<string, FileCategory> = {
  // Documents
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  // Spreadsheets
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  // Presentations
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  // PDF
  pdf: 'pdf',
  // Images
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  // Video
  mp4: 'video',
  avi: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  // Audio
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  m4a: 'audio',
  // Archives
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  // Code
  js: 'code',
  ts: 'code',
  py: 'code',
  html: 'code',
  css: 'code',
  json: 'code',
  xml: 'code',
  // Text
  txt: 'text',
  md: 'text',
  log: 'text',
};

export function getFileCategory(extension: string): FileCategory {
  return EXT_CATEGORY[extension] ?? 'other';
}

/** Whether this file type can be previewed in-browser */
export function isPreviewable(extension: string): boolean {
  const cat = getFileCategory(extension);
  return cat === 'image' || cat === 'pdf';
}
