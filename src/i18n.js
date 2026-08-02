/**
 * Aegis Vault i18n Translation Engine (Tiếng Việt & English)
 */

export const DICTIONARY = {
  vi: {
    // Header & Navigation
    searchPlaceholder: "Tìm kiếm Aegis Vault...",
    tabLogins: "🔑 Tài khoản đăng nhập",
    tabSecurity: "🛡️ Trung tâm bảo mật",
    tabIdentity: "👤 Định danh",
    tabSettings: "⚙️ Cài đặt",
    tabDonate: "☕ Mời tôi một ly cà phê",
    topDonateBtn: "☕ Mời tôi một ly cà phê",
    topHelp: "Trợ giúp",
    changeMasterPwd: "🔑 Đổi mật khẩu chính",
    signOutGoogle: "🚪 Đăng xuất Google",

    // Sub Tabs
    subTabPopular: "Phổ biến",
    subTabRecent: "Cập nhật gần đây",
    subTabAZ: "A-Z",

    // Popup Main Tabs
    popupTabLogins: "Tài khoản",
    popupTabGenerator: "Tạo mật khẩu",
    popupTabOtp: "OTP",

    // Auth & Unlock
    unlockVault: "Mở khóa kho bảo mật",
    unlockVaultHeader: "Mở khóa kho bảo mật",
    cantCreateVault: "Chưa thể tạo kho bảo mật",
    createVaultHeader: "Tạo kho bảo mật",
    masterPwdLabel: "Mật khẩu chính",
    confirmMasterPwdLabel: "Nhập lại mật khẩu chính",
    unlockBtnText: "Mở khóa →",
    waitingFirebase: "Đang chờ Firebase",
    createVaultBtn: "Tạo kho bảo mật →",
    signInDiffGoogle: "Đăng nhập tài khoản Google khác",
    signInToManageTitle: "Đăng nhập để quản lý",
    signInToManageDesc: "Google chỉ xác minh danh tính. Dữ liệu vẫn được mã hóa hoàn toàn cục bộ.",
    continueWithGoogle: "Tiếp tục với Google →",
    enterMasterPwd: "Nhập mật khẩu chính để tiếp tục.",
    firebaseCheckPending: "Aegis chưa kiểm tra xong dữ liệu trên Firebase. Hãy thử đồng bộ lại để tránh ghi đè bản sao lưu hiện có.",
    createMasterPwdHint: "Tạo câu mật khẩu chính tối thiểu 6 ký tự, dài và duy nhất.",
    unlockBtn: "Mở khóa",
    signInGooglePrompt: "Bạn chưa đăng nhập tài khoản Google.",
    signInGoogleBtn: "Đăng nhập với Google",
    vaultLockedMsg: "Kho mật khẩu của bạn đang khóa.",
    vaultLockedHint: "Vui lòng mở khóa trước khi quản lý dữ liệu.",
    lockVaultBtn: "Khóa kho bảo mật",
    deviceOnlyUnlocked: "Kho bảo mật đã mở khóa (chế độ thiết bị)",
    openingVault: "Đang mở kho bảo mật…",

    // Password Generator
    pwdLength: "Độ dài mật khẩu",
    pwdIncludeUpper: "Chữ hoa (A-Z)",
    pwdIncludeLower: "Chữ thường (a-z)",
    pwdIncludeNumbers: "Chữ số (0-9)",
    pwdIncludeSymbols: "Ký tự đặc biệt (!@#$)",
    copyPwdBtn: "📋 Sao chép mật khẩu",
    copiedMsg: "✓ Đã sao chép!",

    // OTP Section
    otpTitle: "Mã xác thực OTP (2FA)",
    scanQrBtn: "📷 Quét QR trên màn hình",
    addOtpManualBtn: "➕ Thêm thủ công",
    noOtpMsg: "Chưa có mã OTP nào được thêm.",
    copyOtpBtn: "Sao chép OTP",
    deleteOtpBtn: "Xóa OTP",

    // Screen QR Scanner
    qrScannerHint: "Kéo chọn vùng chứa mã QR OTP trên màn hình của bạn",
    qrCancelBtn: "Hủy quét",

    // Drawer / Form Editor
    addTitle: "Thêm tài khoản mới",
    editTitle: "Chỉnh sửa tài khoản",
    fieldName: "Tên dịch vụ",
    fieldUrl: "Địa chỉ Web (URL)",
    fieldUser: "Tên đăng nhập / Email",
    fieldPassword: "Mật khẩu",
    fieldFavorite: "Đánh dấu yêu thích",
    fieldNotes: "Ghi chú",
    saveBtn: "Lưu",
    cancelBtn: "Hủy",
    deleteBtn: "Xóa tài khoản này",
    openUrl: "Mở ↗",
    showPwd: "Hiện",
    hidePwd: "Ẩn",

    // Security Center
    securityScoreTitle: "Điểm an toàn",
    securityAnalyzing: "Đang phân tích độ an toàn mật khẩu...",
    securityStrong: "Mật khẩu mạnh",
    securityMedium: "Trung bình",
    securityWeak: "Mật khẩu yếu",
    securityReused: "Đang dùng lại",
    securityIssues: "Cần xử lý",
    securityAll: "Tất cả",

    // Backup & Settings
    backupCardTitle: "Sao lưu toàn bộ kho bảo mật đã mã hóa",
    backupDownload: "Tải bản sao lưu",
    backupRestore: "Khôi phục kho bảo mật",
    lastpassImportTitle: "Nhập dữ liệu CSV",
    otpImportTitle: "Nhập và xuất mã OTP",
    firebaseConflictMsg: "Xung đột dữ liệu với Firebase.",
    syncErrorMsg: "Lỗi kết nối hoặc đồng bộ Firebase.",
    resolveBtn: "Xử lý",
    detailsBtn: "Chi tiết",
    syncErrorDetails: "Chi tiết lỗi đồng bộ",
    
    // Donate Modal
    donateTitle: "Mời tôi một ly cà phê",
    donateDesc: "Cảm ơn bạn đã tin tưởng và sử dụng Aegis Vault! Mọi sự hỗ trợ của bạn là nguồn động lực rất lớn để tác giả duy trì và tiếp tục phát triển tiện ích.",
    donateNetwork: "Mạng lưới",
    donateAddress: "Địa chỉ ví",
    donateCopyBtc: "📋 Sao chép địa chỉ BTC",
    donateCopyUsdt: "📋 Sao chép địa chỉ USDT",
    donateCopiedBtc: "✓ Đã sao chép BTC!",
    donateCopiedUsdt: "✓ Đã sao chép USDT!",

    // New Item Types & Features
    tabNotes: "📝 Ghi chú",
    tabCards: "💳 Thẻ ATM",
    tabIdentities: "👤 Định danh",
    tabTrash: "🗑️ Thùng rác",
    pwdHistoryTitle: "📜 Lịch sử mật khẩu cũ",
    restoreBtn: "Khôi phục",
    deletePermanentlyBtn: "Xóa vĩnh viễn",
    emptyTrashBtn: "Làm sạch thùng rác",
    emptyTrashConfirm: "Bạn có chắc chắn muốn xóa vĩnh viễn tất cả mục trong thùng rác không?",
    noNotesMsg: "Chưa có ghi chú bảo mật nào.",
    noCardsMsg: "Chưa có thẻ thanh toán nào.",
    noIdentitiesMsg: "Chưa có thông tin định danh nào.",
    noTrashMsg: "Thùng rác rỗng.",
    addNoteTitle: "Thêm ghi chú bảo mật",
    addCardTitle: "Thêm thẻ thanh toán",
    addIdentityTitle: "Thêm thông tin định danh",

    // Language Selector
    langVi: "🇻🇳 Tiếng Việt",
    langEn: "🇬🇧 English"
  },

  en: {
    // Header & Navigation
    searchPlaceholder: "Search Aegis Vault...",
    tabLogins: "🔑 Logins",
    tabSecurity: "🛡️ Security",
    tabIdentity: "👤 Identity",
    tabSettings: "⚙️ Settings",
    tabDonate: "☕ Buy me a coffee",
    topDonateBtn: "☕ Buy me a coffee",
    topHelp: "Help",
    changeMasterPwd: "🔑 Change Master Password",
    signOutGoogle: "🚪 Sign Out Google",

    // Sub Tabs
    subTabPopular: "Popular",
    subTabRecent: "Recently Updated",
    subTabAZ: "A-Z",

    // Popup Main Tabs
    popupTabLogins: "Logins",
    popupTabGenerator: "Password Generator",
    popupTabOtp: "OTP",

    // Auth & Unlock
    unlockVault: "Unlock Vault",
    unlockVaultHeader: "Unlock Secure Vault",
    cantCreateVault: "Cannot Create Vault Yet",
    createVaultHeader: "Create Secure Vault",
    masterPwdLabel: "Master Password",
    confirmMasterPwdLabel: "Confirm Master Password",
    unlockBtnText: "Unlock →",
    waitingFirebase: "Waiting for Firebase",
    createVaultBtn: "Create Vault →",
    signInDiffGoogle: "Sign in with a different Google account",
    signInToManageTitle: "Sign in to Manage",
    signInToManageDesc: "Google verifies identity only. Vault data remains fully encrypted locally.",
    continueWithGoogle: "Continue with Google →",
    enterMasterPwd: "Enter your master password to continue.",
    firebaseCheckPending: "Aegis has not finished checking Firebase data. Please try syncing again to avoid overwriting existing backup.",
    createMasterPwdHint: "Create a strong, unique master password with at least 6 characters.",
    unlockBtn: "Unlock",
    signInGooglePrompt: "You are not signed in to a Google account.",
    signInGoogleBtn: "Sign in with Google",
    vaultLockedMsg: "Your vault is currently locked.",
    vaultLockedHint: "Please unlock your vault to manage credentials.",
    lockVaultBtn: "Lock Vault",
    deviceOnlyUnlocked: "Vault Unlocked (Device Mode)",
    openingVault: "Opening Vault…",

    // Password Generator
    pwdLength: "Password Length",
    pwdIncludeUpper: "Uppercase (A-Z)",
    pwdIncludeLower: "Lowercase (a-z)",
    pwdIncludeNumbers: "Numbers (0-9)",
    pwdIncludeSymbols: "Symbols (!@#$)",
    copyPwdBtn: "📋 Copy Password",
    copiedMsg: "✓ Copied!",

    // OTP Section
    otpTitle: "OTP Authenticator (2FA)",
    scanQrBtn: "📷 Scan QR Code on Screen",
    addOtpManualBtn: "➕ Add Manually",
    noOtpMsg: "No OTP tokens added yet.",
    copyOtpBtn: "Copy OTP",
    deleteOtpBtn: "Delete OTP",

    // Screen QR Scanner
    qrScannerHint: "Drag to select the QR code region on your screen",
    qrCancelBtn: "Cancel Scan",

    // Drawer / Form Editor
    addTitle: "Add New Login",
    editTitle: "Edit Login",
    fieldName: "Service Name",
    fieldUrl: "Website URL",
    fieldUser: "Username / Email",
    fieldPassword: "Password",
    fieldFavorite: "Mark as Favorite",
    fieldNotes: "Notes",
    saveBtn: "Save",
    cancelBtn: "Cancel",
    deleteBtn: "Delete This Login",
    openUrl: "Open ↗",
    showPwd: "Show",
    hidePwd: "Hide",

    // Security Center
    securityScoreTitle: "Security Score",
    securityAnalyzing: "Analyzing password security...",
    securityStrong: "Strong Passwords",
    securityMedium: "Medium",
    securityWeak: "Weak Passwords",
    securityReused: "Reused",
    securityIssues: "Action Needed",
    securityAll: "All",

    // Backup & Settings
    backupCardTitle: "Backup Encrypted Vault",
    backupDownload: "Download Backup",
    backupRestore: "Restore Vault",
    lastpassImportTitle: "Import from LastPass",
    otpImportTitle: "Import & Export OTP",
    firebaseConflictMsg: "Data conflict with Firebase.",
    syncErrorMsg: "Firebase connection or sync error.",
    resolveBtn: "Resolve",
    detailsBtn: "Details",
    syncErrorDetails: "Sync error details",
    
    // Donate Modal
    donateTitle: "Buy me a coffee",
    donateDesc: "Thank you for using Aegis Vault! Your generous support keeps this project active and continually improved.",
    donateNetwork: "Network",
    donateAddress: "Wallet Address",
    donateCopyBtc: "📋 Copy BTC Address",
    donateCopyUsdt: "📋 Copy USDT Address",
    donateCopiedBtc: "✓ Copied BTC Address!",
    donateCopiedUsdt: "✓ Copied USDT Address!",

    // New Item Types & Features
    tabNotes: "📝 Notes",
    tabCards: "💳 Cards",
    tabIdentities: "👤 Identity",
    tabTrash: "🗑️ Trash",
    pwdHistoryTitle: "📜 Password History",
    restoreBtn: "Restore",
    deletePermanentlyBtn: "Delete Permanently",
    emptyTrashBtn: "Empty Trash",
    emptyTrashConfirm: "Are you sure you want to permanently delete all items in the trash?",
    noNotesMsg: "No secure notes added yet.",
    noCardsMsg: "No payment cards added yet.",
    noIdentitiesMsg: "No identities added yet.",
    noTrashMsg: "Trash is empty.",
    addNoteTitle: "Add Secure Note",
    addCardTitle: "Add Payment Card",
    addIdentityTitle: "Add Personal Identity",
    langVi: "🇻🇳 Tiếng Việt",
    langEn: "🇬🇧 English"
  }
};

let currentLang = 'en';

/**
 * Get current language setting. Defaults to English ('en') if not explicitly set.
 */
export async function getLanguage() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(['aegisLanguage']);
      currentLang = res.aegisLanguage === 'vi' ? 'vi' : 'en';
    } else {
      currentLang = 'en';
    }
  } catch {
    currentLang = 'en';
  }
  return currentLang;
}

/**
 * Set current language setting.
 */
export async function setLanguage(lang) {
  currentLang = lang === 'vi' ? 'vi' : 'en';
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ aegisLanguage: currentLang });
    }
  } catch (err) {
    console.error('Failed to save language preference:', err);
  }
  return currentLang;
}

/**
 * Get translated text for a key.
 */
export function t(key, fallback = '') {
  const dict = DICTIONARY[currentLang] || DICTIONARY.en;
  return dict[key] !== undefined ? dict[key] : (DICTIONARY.en[key] || fallback || key);
}

const LEGACY_UI_TEXT = new Map([
  ['🔑 Logins', '🔑 Tài khoản đăng nhập'],
  ['🛡️ Security Center', '🛡️ Trung tâm bảo mật'],
  ['⚙️ Settings', '⚙️ Cài đặt'],
  ['Popular', 'Phổ biến'],
  ['Zero-Knowledge Security', 'Bảo mật không kiến thức'],
  ['📝 Ghi chú bảo mật (Secure Notes)', '📝 Ghi chú bảo mật'],
  ['💳 Thẻ thanh toán (Credit / Debit Cards)', '💳 Thẻ thanh toán'],
  ['🗑️ Thùng rác (Recycle Bin)', '🗑️ Thùng rác'],
  ['Aegis Security Center', 'Trung tâm bảo mật Aegis'],
  ['Backup và khôi phục Vault', 'Sao lưu và khôi phục kho bảo mật'],
  ['Backup toàn bộ Vault đã mã hóa', 'Sao lưu toàn bộ kho bảo mật đã mã hóa'],
  ['Tải backup mã hóa', 'Tải bản sao lưu mã hóa'],
  ['Tải backup', 'Tải bản sao lưu'],
  ['Khôi phục từ backup', 'Khôi phục từ bản sao lưu'],
  ['Chọn tệp backup', 'Chọn tệp sao lưu'],
  ['Mật khẩu chính của backup', 'Mật khẩu chính của bản sao lưu'],
  ['Bản local trước khi dùng Firebase', 'Bản cục bộ trước khi dùng Firebase'],
  ['Tải bản local cũ', 'Tải bản cục bộ cũ'],
  ['Cancel', 'Hủy'], ['Save', 'Lưu'], ['Name', 'Tên'], ['Go to URL', 'Đi tới URL'],
  ['Match URL', 'URL khớp'], ['User ID', 'Tên đăng nhập'], ['Password', 'Mật khẩu'],
  ['Show', 'Hiện'], ['Hide', 'Ẩn'], ['VALID THRU', 'HẾT HẠN'], ['AEGIS', 'AEGIS'],
  ['PASSWORD GENERATOR', 'TRÌNH TẠO MẬT KHẨU'], ['Google Profile', 'Hồ sơ Google'],
  ['First Name', 'Tên'], ['Email', 'Email'], ['Import ảnh QR', 'Nhập ảnh QR'],
  ['Secret Base32', 'Mã bí mật Base32'], ['Secret chỉ được xử lý cục bộ trong Vault', 'Mã bí mật chỉ được xử lý cục bộ trong kho bảo mật'],
  ['Vault', 'Kho bảo mật'], ['Dashboard', 'Bảng điều khiển']
].map(([en, vi]) => [en, { en, vi }]));

const LEGACY_UI_BY_VALUE = new Map();
for (const pair of LEGACY_UI_TEXT.values()) {
  LEGACY_UI_BY_VALUE.set(pair.en, pair);
  LEGACY_UI_BY_VALUE.set(pair.vi, pair);
}

function translateLegacyTextNodes(doc, lang) {
  const root = doc.body || doc.documentElement;
  if (!root || typeof doc.createTreeWalker !== 'function') return;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,[data-i18n],[data-no-auto-i18n]')) continue;
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    const pair = LEGACY_UI_BY_VALUE.get(trimmed);
    if (!pair) continue;
    node.nodeValue = raw.replace(trimmed, pair[lang]);
  }
  doc.documentElement.lang = lang;
}

export function translateDocument(doc = document) {
  const lang = currentLang;
  const dict = DICTIONARY[lang] || DICTIONARY.en;

  doc.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  doc.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key] !== undefined) {
      el.placeholder = dict[key];
    }
  });

  doc.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (dict[key] !== undefined) {
      el.title = dict[key];
    }
  });

  translateLegacyTextNodes(doc, lang);
}

/**
 * Initialize i18n for the page and listen for language changes.
 */
export async function i18nInit(onLangChange = null) {
  await getLanguage();
  translateDocument();

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.aegisLanguage) {
        currentLang = changes.aegisLanguage.newValue === 'vi' ? 'vi' : 'en';
        translateDocument();
        if (typeof onLangChange === 'function') {
          onLangChange(currentLang);
        }
      }
    });
  }

  return currentLang;
}
