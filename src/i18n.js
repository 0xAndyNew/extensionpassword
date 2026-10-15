/**
 * Aegis Vault i18n Translation Engine (Tiếng Việt & English)
 */

export const DICTIONARY = {
  vi: {
    // Header & Navigation
    searchPlaceholder: "Tìm kiếm Aegis Vault...",
    tabLogins: "🔑 Tài khoản đăng nhập",
    tabOtp: "◷ Mã OTP",
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
    retryFirebaseCheck: "Kiểm tra lại Firebase",
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
    otpImportImage: "Nhập ảnh QR",
    otpAddCode: "+ Thêm mã",
    otpAddTitle: "Thêm mã xác thực",
    otpSetupUri: "URI thiết lập (không bắt buộc)",
    otpSetupHint: "Dán URI để điền nhanh. Các trường hiển thị bên dưới luôn là dữ liệu được lưu.",
    otpService: "Dịch vụ",
    otpAccountLabel: "Tài khoản",
    otpBase32Secret: "Secret Base32",
    otpAlgorithmLabel: "Thuật toán",
    otpDigitsLabel: "Số chữ số",
    otpPeriodLabel: "Chu kỳ (giây)",
    otpDeleteCode: "Xóa mã OTP này",
    otpDeletePrompt: "Bạn có đồng ý xóa mã OTP này không?",
    otpKeepCode: "Không xóa",
    otpConfirmDelete: "Đồng ý xóa",
    otpSelectRegion: "Khoanh vùng QR",
    otpImageLabel: "Ảnh QR",
    otpSaveCode: "Lưu OTP",
    otpQrCodeTitle: "Mã QR OTP",
    otpQrSecretWarning: "QR chứa secret OTP. Chỉ quét bằng thiết bị tin cậy và không chia sẻ ảnh này.",
    otpClose: "Đóng",
    otpScanTitle: "Quét QR trên tab trình duyệt",
    otpChooseTab: "Chọn tab chứa mã QR",
    otpStartScan: "Khoanh vùng QR",
    scanQrBtn: "📷 Quét QR trên màn hình",
    scanScreen: "Quét màn hình",
    importQrImage: "Import ảnh QR",
    qrPermissionHint: "Cần quyền truy cập trang này để quét QR. Bấm bên dưới rồi chọn Cho phép trong trình duyệt.",
    qrAllowPage: "Cho phép truy cập trang",
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
    addNoteBtn: "+ Thêm ghi chú mới",
    addCardBtn: "+ Thêm thẻ mới",

    // Language Selector
    langVi: "🇻🇳 Tiếng Việt",
    langEn: "🇬🇧 Tiếng Anh"
  },

  en: {
    // Header & Navigation
    searchPlaceholder: "Search Aegis Vault...",
    tabLogins: "🔑 Logins",
    tabOtp: "◷ OTP",
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
    retryFirebaseCheck: "Retry Firebase check",
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
    otpImportImage: "Import QR image",
    otpAddCode: "+ Add code",
    otpAddTitle: "Add authenticator",
    otpSetupUri: "Setup URI (optional)",
    otpSetupHint: "Paste a URI to fill the fields. The fields below are the data that will be saved.",
    otpService: "Service",
    otpAccountLabel: "Account",
    otpBase32Secret: "Base32 secret",
    otpAlgorithmLabel: "Algorithm",
    otpDigitsLabel: "Digits",
    otpPeriodLabel: "Period (seconds)",
    otpDeleteCode: "Delete this OTP",
    otpDeletePrompt: "Do you agree to delete this OTP?",
    otpKeepCode: "Keep OTP",
    otpConfirmDelete: "Delete OTP",
    otpSelectRegion: "Select QR region",
    otpImageLabel: "QR image",
    otpSaveCode: "Save OTP",
    otpQrCodeTitle: "OTP QR code",
    otpQrSecretWarning: "This QR contains your OTP secret. Only scan it with a trusted device and do not share this image.",
    otpClose: "Close",
    otpScanTitle: "Scan QR on a browser tab",
    otpChooseTab: "Choose the tab containing the QR code",
    otpStartScan: "Select QR region",
    scanQrBtn: "📷 Scan QR Code on Screen",
    scanScreen: "Scan screen",
    importQrImage: "Import QR image",
    qrPermissionHint: "Page access is needed to scan QR. Click below, then choose Allow in the browser.",
    qrAllowPage: "Allow page access",
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
    addNoteBtn: "+ Add new note",
    addCardBtn: "+ Add new card",
    langVi: "🇻🇳 Vietnamese",
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
  ['🔑 Logins', '🔑 Tài khoản đăng nhập'], ['🛡️ Security Center', '🛡️ Trung tâm bảo mật'],
  ['⚙️ Settings', '⚙️ Cài đặt'], ['Popular', 'Phổ biến'], ['Cancel', 'Hủy'], ['Save', 'Lưu'],
  ['Name', 'Tên'], ['Go to URL', 'Đi tới URL'], ['Match URL', 'URL khớp'],
  ['User ID', 'Tên đăng nhập'], ['Password', 'Mật khẩu'], ['Show', 'Hiện'], ['Hide', 'Ẩn'],
  ['Open', 'Mở'], ['Open website?', 'Mở website?'], ['Confirm opening website', 'Xác nhận mở website'],
  ['Retry', 'Thử lại'], ['Edit', 'Sửa'], ['Delete', 'Xóa'], ['Copy', 'Sao chép'],
  ['Copied', 'Đã sao chép'], ['No email', 'Chưa có email'], ['Untitled', 'Không tiêu đề'],
  ['No username', 'Không có tên đăng nhập'], ['Invalid OTP', 'OTP không hợp lệ'],
  ['No logins found.', 'Không có tài khoản đăng nhập nào.'],
  ['No accounts found.', 'Không có tài khoản nào được tìm thấy.'],
  ['Cannot connect to Aegis Vault.', 'Không thể kết nối với Aegis Vault.'],
  ['Cannot read Vault data.', 'Không thể đọc dữ liệu Vault.'],
  ['Aegis Vault is taking longer than expected. Retrying…', 'Aegis phản hồi chậm. Đang thử kết nối lại…'],
  ['Sign in to manage Vault', 'Đăng nhập để quản lý Vault'],
  ['Sign in with Google from the Aegis Vault toolbar popup before managing your data.', 'Vui lòng nhấp vào biểu tượng Aegis Vault ở thanh công cụ trình duyệt để đăng nhập Google trước khi quản lý.'],
  ['Unlock Aegis Vault', 'Mở khóa Aegis Vault'],
  ['Enter your master password to unlock all logins, notes, and payment cards.', 'Nhập mật khẩu chính của bạn để mở khóa tất cả tài khoản, ghi chú và thẻ thanh toán.'],
  ['Enter master password', 'Nhập mật khẩu chính'], ['Unlock Vault →', 'Mở khóa Vault →'],
  ['Unlocking…', 'Đang mở khóa…'], ['Incorrect master password.', 'Mật khẩu chính không đúng.'],
  ['Please enter your master password.', 'Vui lòng nhập mật khẩu chính.'],
  ['View password & OTP', 'Xem mật khẩu & OTP'], ['View details', 'Xem thông tin'],
  ['Click to view details · Right-click to open website', 'Nhấp để xem thông tin · Nhấp chuột phải để mở website'],
  ['Username', 'Tên đăng nhập'], ['information', 'thông tin'], ['password', 'mật khẩu'], ['OTP code', 'mã OTP'],
  ['Strong', 'Mạnh'], ['Medium', 'Trung bình'], ['Weak', 'Yếu'], ['Reused', 'Dùng lại'],
  ['Very well protected', 'Bảo vệ rất tốt'], ['Well protected', 'Mức bảo vệ tốt'],
  ['Needs improvement', 'Cần cải thiện'], ['High risk', 'Rủi ro cao'],
  ['No accounts to analyze. Add your first password to the Vault.', 'Chưa có tài khoản nào để phân tích. Hãy thêm mật khẩu đầu tiên vào Vault.'],
  ['Excellent! All passwords are strong and unique.', 'Tuyệt vời! Tất cả mật khẩu đều mạnh và không bị dùng lại.'],
  ['Default domain match', 'Khớp tên miền mặc định'], ['Please complete Website, Username, and Password.', 'Vui lòng điền Website, Tên đăng nhập và Mật khẩu.'],
  ['Website must be a valid HTTP or HTTPS address.', 'Website phải là một địa chỉ HTTP hoặc HTTPS hợp lệ.'],
  ['Saving…', 'Đang lưu…'], ['Saved login successfully.', 'Đã lưu thông tin tài khoản thành công.'],
  ['Deleted login.', 'Đã xóa tài khoản.'], ['Add login', 'Thêm tài khoản'],
  ['Add secure note', 'Thêm ghi chú bảo mật'], ['Edit secure note', 'Sửa ghi chú bảo mật'],
  ['New note', 'Ghi chú mới'], ['No content.', 'Không có nội dung.'],
  ['Note content is hidden', 'Nội dung ghi chú đang được ẩn'],
  ['Please enter a note title or content.', 'Vui lòng nhập tiêu đề hoặc nội dung ghi chú.'],
  ['Saved note successfully.', 'Đã lưu ghi chú thành công.'],
  ['Add payment card', 'Thêm thẻ thanh toán'], ['Edit payment card', 'Sửa thẻ thanh toán'],
  ['Payment card', 'Thẻ ATM'], ['Payment card / Credit', 'Thẻ ATM / Credit'],
  ['Cardholder: ', 'Chủ thẻ: '], ['Expires: ', 'Hạn: '], ['Copy card number', 'Copy số thẻ'],
  ['Please enter a card number.', 'Vui lòng nhập số thẻ.'], ['Saved card successfully.', 'Đã lưu thẻ thành công.'],
  ['Restore', 'Khôi phục'], ['Delete permanently', 'Xóa vĩnh viễn'],
  ['Restore item?', 'Khôi phục thông tin?'], ['Delete item?', 'Xóa thông tin?'],
  ['Delete permanently?', 'Xóa vĩnh viễn?'], ['Confirm action?', 'Xác nhận thao tác?'],
  ['Confirm', 'Đồng ý'], ['Confirm delete', 'Đồng ý xóa'], ['Do not delete', 'Không xóa'],
  ['Do you want to continue?', 'Bạn có muốn tiếp tục không?'],
  ['Hide password', 'Ẩn mật khẩu'], ['Show password', 'Hiện mật khẩu'],
  ['Hide CVV', 'Ẩn mã CVV'], ['Show CVV', 'Hiện mã CVV'],
  ['No file selected', 'Chưa chọn tệp'], ['Invalid file', 'Tệp không hợp lệ'],
  ['Unknown error.', 'Lỗi không xác định.'], ['Import CSV', 'Nhập CSV'], ['Export CSV', 'Xuất CSV'],
  ['Import OTP', 'Nhập OTP'], ['Export OTP TXT', 'Xuất OTP TXT'],
  ['Importing…', 'Đang nhập…'], ['Exporting…', 'Đang xuất…'], ['Restoring…', 'Đang khôi phục…'],
  ['Download backup', 'Tải backup'], ['Restore Vault', 'Khôi phục Vault'],
  ['Enter master password to create a backup.', 'Nhập mật khẩu chính để tạo backup.'],
  ['Enter master password to export CSV.', 'Nhập mật khẩu chính để xuất CSV.'],
  ['Enter master password to export OTP.', 'Nhập mật khẩu chính để xuất OTP.'],
  ['Please select an Aegis backup file.', 'Hãy chọn tệp backup Aegis.'],
  ['Backup file is empty.', 'Tệp backup đang trống.'], ['CSV file is empty.', 'Tệp CSV đang trống.'],
  ['OTP file is empty.', 'Tệp OTP đang trống.'], ['Cannot read backup file.', 'Không thể đọc tệp backup.'],
  ['Cannot read CSV file.', 'Không thể đọc tệp CSV.'], ['Cannot read OTP file.', 'Không thể đọc tệp OTP.'],
  ['Update master password', 'Cập nhật mật khẩu chính'],
  ['Please enter your current master password.', 'Vui lòng nhập mật khẩu chính hiện tại.'],
  ['Please enter a new master password.', 'Vui lòng nhập mật khẩu chính mới.'],
  ['Please confirm your new master password.', 'Vui lòng xác nhận mật khẩu chính mới.'],
  ['The new master password must contain at least 6 characters.', 'Mật khẩu chính mới phải có ít nhất 6 ký tự.'],
  ['The new passwords do not match.', 'Mật khẩu mới và nhập lại mật khẩu mới không trùng khớp nhau.'],
  ['The new password must differ from the current password.', 'Mật khẩu mới không được trùng với mật khẩu hiện tại.'],
  ['Sign out of the current Google account?', 'Bạn có chắc chắn muốn đăng xuất tài khoản Google hiện tại?'],
  ['VALID THRU', 'HẾT HẠN'], ['PASSWORD GENERATOR', 'TRÌNH TẠO MẬT KHẨU'],
  ['Google Profile', 'Hồ sơ Google'], ['First Name', 'Tên'], ['Email', 'Email'],
  ['Import QR image', 'Nhập ảnh QR'], ['Secret Base32', 'Mã bí mật Base32'],
  ['Vault', 'Kho bảo mật'], ['Dashboard', 'Bảng điều khiển'],

  // Popup states and actions created dynamically by JavaScript.
  ['No email', 'Chưa có email'], ['Try again', 'Thử lại'],
  ['Vault data could not be loaded', 'Chưa tải được dữ liệu Vault'],
  ['Aegis has not responded yet.', 'Aegis chưa phản hồi.'],
  ['The open page has changed. Close and reopen Aegis Vault on the page you want to fill.', 'Trang đang mở đã thay đổi. Hãy đóng rồi mở lại Aegis Vault trên trang cần điền.'],
  ['Could not connect to this page. Reload the page and try again.', 'Không thể kết nối với trang này. Hãy tải lại trang rồi thử lại.'],
  ['Could not read account details', 'Không đọc được thông tin tài khoản'],
  ['Invalid OTP', 'OTP không hợp lệ'], ['OTP is invalid — check it and try again', 'OTP không hợp lệ — hãy kiểm tra lại'],
  ['OTP code', 'mã OTP'], ['username', 'tên đăng nhập'], ['password', 'mật khẩu'],
  ['Please enter your master password.', 'Vui lòng nhập mật khẩu chính.'],
  ['The master password must contain at least 6 characters.', 'Mật khẩu chính phải có ít nhất 6 ký tự.'],
  ['Please confirm your master password.', 'Vui lòng nhập lại mật khẩu chính để xác nhận.'],
  ['The master passwords do not match.', 'Mật khẩu chính và Nhập lại mật khẩu không trùng khớp nhau!'],
  ['Creating secure vault…', 'Đang khởi tạo kho bảo mật…'],
  ['Checking and unlocking…', 'Đang kiểm tra & mở khóa…'],
  ['Incorrect password. Please try again.', 'Mật khẩu không đúng. Vui lòng thử lại.'],
  ['Unlock failed. Please try again.', 'Mở khóa thất bại. Vui lòng thử lại.'],
  ['Something went wrong.', 'Có lỗi xảy ra.'], ['Confirm sign out?', 'Xác nhận đăng xuất?'],
  ['Sign out of Google', 'Đăng xuất Google'], ['Confirm account sign out?', 'Xác nhận đăng xuất tài khoản?'],
  ['Sign in with a different Google account', 'Đăng nhập tài khoản Google khác'],
  ['Select at least one character group.', 'Hãy chọn ít nhất một nhóm ký tự.'],
  ['Copied', 'Đã chép'], ['Password copied.', 'Mật khẩu đã được sao chép.'],
  ['Chrome blocked copying. Select the password and copy it manually.', 'Chrome không cho phép sao chép. Hãy chọn mật khẩu và sao chép thủ công.'],
  ['Select at least 1 character type', 'Chọn ít nhất 1 loại ký tự'],
  ['Could not load OTP accounts.', 'Không tải được danh sách OTP.'],
  ['Loading OTP codes…', 'Đang tải mã OTP…'],
  ['No OTP codes yet. Select “Add code” to get started.', 'Chưa có mã OTP. Chọn “Thêm mã” để bắt đầu.'],
  ['Invalid OTP settings.', 'Thông số OTP không hợp lệ.'],
  ['The OTP code is invalid. Select edit to check the secret and settings.', 'Mã OTP không hợp lệ. Chọn nút sửa để kiểm tra lại secret và thông số.'],
  ['Drag to reorder', 'Kéo để đổi thứ tự'], ['Show QR code for scanning', 'Hiển thị QR để quét'],
  ['Edit or delete OTP', 'Sửa hoặc xóa OTP'], ['Edit OTP before creating a QR code', 'Sửa OTP trước khi tạo mã QR'],
  ['Cannot create a QR code because the OTP is invalid', 'Không thể tạo QR vì OTP không hợp lệ'],
  ['Could not save OTP order', 'Không thể lưu thứ tự OTP'], ['OTP QR code', 'Mã QR OTP'],
  ['Add authenticator code', 'Thêm mã xác thực'], ['Confirm delete', 'Đồng ý xóa'],
  ['Edit authenticator code', 'Sửa mã xác thực'], ['Save OTP', 'Lưu OTP'],
  ['Encrypting and saving securely on this device…', 'Đang mã hóa và lưu an toàn trên máy…'],
  ['OTP saved · Firebase sync pending', 'Đã lưu OTP · đang tự đồng bộ Firebase'],
  ['OTP saved and synced with Firebase', 'Đã lưu OTP và đồng bộ Firebase'], ['OTP saved', 'Đã lưu OTP'],
  ['Deleting…', 'Đang xóa…'], ['OTP deleted from this device', 'Đã xóa OTP trên máy'],
  ['Could not delete the OTP code', 'Không xóa được mã OTP'],
  ['OTP deleted · Firebase sync pending', 'Đã xóa OTP · đang tự đồng bộ Firebase'],
  ['OTP code deleted', 'Đã xóa mã OTP'], ['OTP code scanned', 'Đã quét được mã OTP'],
  ['QR detected. Check the details, then select Save OTP.', 'Đã nhận diện QR. Kiểm tra thông tin rồi bấm Lưu OTP.'],
  ['QR code detected', 'Đã nhận diện mã QR'], ['QR decoder is not ready.', 'Bộ nhận diện QR chưa sẵn sàng.'],
  ['Reading QR image…', 'Đang nhận diện ảnh QR…'],
  ['No QR code was found in the image. Choose a clear, uncropped image.', 'Không tìm thấy QR trong ảnh. Hãy chọn ảnh rõ và không bị cắt.'],
  ['Could not save the OTP code automatically.', 'Không tự lưu được mã OTP.'],
  ['This OTP code already exists in the Vault', 'Mã OTP này đã có trong Vault'],
  ['QR scanned and OTP saved automatically', 'Đã quét xong và tự lưu OTP'],
  ['No QR code could be detected in the selected image.', 'Không nhận diện được QR trong ảnh đã chọn.'],
  ['Could not import the QR image.', 'Không import được ảnh QR.'], ['Opening…', 'Đang mở…'],
  ['Invalid Google Authenticator QR data.', 'Dữ liệu QR Google Authenticator không hợp lệ.'],
  ['This Google Authenticator QR version is not supported.', 'Phiên bản QR Google Authenticator không được hỗ trợ.'],
  ['Opening the QR selection tool on the page…', 'Đang mở công cụ khoanh vùng trên trang…'],
  ['Could not determine which page to scan.', 'Không xác định được trang cần quét.'],
  ['The browser does not support QR region selection.', 'Trình duyệt không hỗ trợ công cụ khoanh vùng QR.'],
  ['The browser does not allow QR selection on this system page.', 'Trình duyệt không cho phép khoanh vùng trên trang hệ thống này.'],
  ['Could not open the QR selection tool.', 'Không thể mở công cụ khoanh vùng QR.'],

  // Dashboard actions, file workflows, and service-worker errors.
  ['Could not connect to Aegis Vault.', 'Không thể kết nối tới Aegis Vault.'],
  ['Could not read Vault data.', 'Không thể đọc dữ liệu Vault.'],
  ['Automatically generated from the login URL', 'Tự động tạo từ link đăng nhập'],
  ['Please enter Website, Username, and Password.', 'Vui lòng điền Website, Tên đăng nhập và Mật khẩu.'],
  ['Please enter an OTP secret to generate a code.', 'Vui lòng nhập mã bí mật OTP để tạo mã OTP.'],
  ['Please enter the OTP service, account, and secret.', 'Vui lòng nhập đầy đủ Dịch vụ OTP, Tài khoản OTP và mã bí mật OTP.'],
  ['Saved login successfully.', 'Đã lưu thông tin tài khoản thành công.'],
  ['Could not save', 'Không thể lưu'], ['Could not delete', 'Không thể xóa'],
  ['Delete this login?', 'Bạn có đồng ý xóa thông tin tài khoản này không?'],
  ['View note', 'Xem ghi chú'], ['Note content is hidden', 'Nội dung ghi chú đang được ẩn'],
  ['Copy content', 'Sao chép nội dung'], ['Delete this note?', 'Bạn có đồng ý xóa ghi chú này không?'],
  ['View card', 'Xem thẻ'], ['Copy card number', 'Copy số thẻ'],
  ['Delete this payment card?', 'Bạn có đồng ý xóa thẻ thanh toán này không?'],
  ['BANK', 'NGÂN HÀNG'], ['NOTE', 'GHI CHÚ'],
  ['Deleted', 'Đã xóa'], ['Restoring…', 'Đang khôi phục…'],
  ['Restore this item?', 'Khôi phục thông tin?'], ['Do not restore', 'Không khôi phục'],
  ['This data cannot be recovered after deletion.', 'Dữ liệu sẽ không thể khôi phục sau khi xóa.'],
  ['No file selected', 'Chưa chọn tệp'], ['too large', 'quá lớn'], ['checking…', 'đang kiểm tra…'],
  ['invalid', 'không hợp lệ'], ['CSV file is empty.', 'Tệp CSV đang trống.'],
  ['CSV file is invalid.', 'Tệp CSV không hợp lệ.'], ['Could not read the CSV file.', 'Không thể đọc tệp CSV.'],
  ['Import CSV data?', 'Nhập dữ liệu CSV?'], ['Confirm CSV import', 'Đồng ý nhập CSV'],
  ['Do not import', 'Không nhập'], ['Encrypting and importing accounts…', 'Đang mã hóa và nhập tài khoản…'],
  ['Could not import CSV.', 'Không thể nhập CSV.'], ['Export CSV data?', 'Xuất dữ liệu CSV?'],
  ['Confirm CSV export', 'Đồng ý xuất CSV'], ['Do not export', 'Không xuất'],
  ['Verifying and preparing the CSV file…', 'Đang xác minh và chuẩn bị tệp CSV…'],
  ['Could not export the CSV file.', 'Không thể xuất tệp CSV.'],
  ['Aegis does not have permission to download files. Reload the extension.', 'Aegis chưa được cấp quyền tải tệp. Hãy tải lại extension.'],
  ['Enter your master password to create a backup.', 'Nhập mật khẩu chính để tạo backup.'],
  ['Creating…', 'Đang tạo…'], ['Creating an encrypted local backup…', 'Đang tạo bản backup mã hóa cục bộ…'],
  ['Download backup', 'Tải backup'], ['Could not create a backup.', 'Không thể tạo backup.'],
  ['Preparing the old encrypted local copy…', 'Đang chuẩn bị bản local cũ đã mã hóa…'],
  ['Old local copy not found.', 'Không tìm thấy bản local cũ.'],
  ['The old local copy was downloaded. Keep it with the old master password.', 'Đã tải bản local cũ. Hãy giữ kèm mật khẩu chính cũ.'],
  ['Backup file is empty.', 'Tệp backup đang trống.'], ['Could not read the backup file.', 'Không thể đọc tệp backup.'],
  ['Select an Aegis backup file.', 'Hãy chọn tệp backup Aegis.'],
  ['Enter the backup master password.', 'Nhập mật khẩu chính của bản backup.'],
  ['Restore Vault?', 'Khôi phục Vault?'], ['Confirm restore', 'Đồng ý khôi phục'],
  ['Verifying the password and restoring encrypted data…', 'Đang xác minh mật khẩu và khôi phục dữ liệu mã hóa…'],
  ['Could not restore the backup.', 'Không thể khôi phục backup.'],
  ['OTP file is empty.', 'Tệp OTP đang trống.'], ['OTP file is invalid.', 'Tệp OTP không hợp lệ.'],
  ['Could not read the OTP file.', 'Không thể đọc tệp OTP.'], ['Import OTP codes?', 'Nhập mã OTP?'],
  ['Confirm OTP import', 'Đồng ý nhập OTP'], ['Checking and encrypting OTP codes…', 'Đang kiểm tra và mã hóa mã OTP…'],
  ['Could not import OTP.', 'Không thể nhập OTP.'], ['Export OTP codes?', 'Xuất mã OTP?'],
  ['Confirm OTP export', 'Đồng ý xuất OTP'], ['Verifying and preparing the OTP file…', 'Đang xác minh và chuẩn bị tệp OTP…'],
  ['Could not export the OTP file.', 'Không thể xuất tệp OTP.'],
  ['Please enter your current master password.', 'Vui lòng nhập mật khẩu chính hiện tại.'],
  ['Please enter a new master password.', 'Vui lòng nhập mật khẩu chính mới.'],
  ['Please confirm the new master password.', 'Vui lòng xác nhận mật khẩu chính mới.'],
  ['The new master password must contain at least 6 characters.', 'Mật khẩu chính mới phải có ít nhất 6 ký tự.'],
  ['The new passwords do not match. Please check them again.', 'Mật khẩu mới và Nhập lại mật khẩu mới không trùng khớp nhau! Vui lòng kiểm tra lại.'],
  ['The new password must differ from the current password.', 'Mật khẩu mới không được trùng với mật khẩu hiện tại.'],
  ['Checking and updating the master password…', 'Đang kiểm tra & cập nhật mật khẩu chính…'],
  ['Updating the password and re-encrypting data…', 'Đang cập nhật mật khẩu mới và mã hóa lại dữ liệu...'],
  ['Master password updated', 'Cập nhật mật khẩu chính'],
  ['Password change failed', 'Đổi mật khẩu thất bại'], ['Error', 'Lỗi'],
  ['The current password is incorrect.', 'Mật khẩu hiện tại không chính xác.'],
  ['Could not change the password.', 'Không thể thực hiện đổi mật khẩu.'],
  ['Sign out of the current Google account?', 'Bạn có chắc chắn muốn đăng xuất tài khoản Google hiện tại?'],
  ['Show password', 'Hiện mật khẩu'], ['Hide password', 'Ẩn mật khẩu'],

  ['Invalid JSON data.', 'Dữ liệu JSON không hợp lệ.'], ['Invalid website.', 'Website không hợp lệ.'],
  ['Website must use HTTP or HTTPS.', 'Website phải dùng HTTP hoặc HTTPS.'],
  ['Public websites must use HTTPS. HTTP is supported only for localhost.', 'Website công khai phải dùng HTTPS. HTTP chỉ được hỗ trợ cho localhost.'],
  ['Sign in with Google first.', 'Hãy đăng nhập Google trước.'], ['Vault is locked.', 'Vault đang khóa.'],
  ['The page to scan is no longer the active tab.', 'Trang cần quét không còn là tab đang hoạt động.'],
  ['The page to scan changed; please select the QR region again.', 'Trang cần quét đã thay đổi; vui lòng chọn lại vùng QR.'],
  ['Could not merge local changes with Firestore yet.', 'Chưa thể hợp nhất thay đổi local với bản Firestore.'],
  ['Could not synchronize local changes yet.', 'Chưa thể đồng bộ thay đổi local.'],
  ['Could not upload local changes to Firestore yet.', 'Chưa thể tải thay đổi local lên Firestore.'],
  ['Firestore keeps changing; your data is safe locally and synchronization will retry.', 'Firestore đang thay đổi liên tục; dữ liệu vẫn an toàn trên máy và sẽ tự thử lại.'],
  ['This Vault belongs to another Google account.', 'Vault thuộc một tài khoản Google khác.'],
  ['Account not found.', 'Không tìm thấy tài khoản.'], ['Note not found.', 'Không tìm thấy ghi chú.'],
  ['Card not found.', 'Không tìm thấy thẻ.'], ['Identity not found.', 'Không tìm thấy hồ sơ định danh.'],
  ['Item not found in trash.', 'Không tìm thấy mục trong thùng rác.'],
  ['Enter a service or account.', 'Hãy nhập dịch vụ hoặc tài khoản.'], ['OTP code not found.', 'Không tìm thấy mã OTP.'],
  ['Backup file exceeds the allowed size.', 'Tệp backup vượt quá dung lượng cho phép.'],
  ['Invalid action.', 'Hành động không hợp lệ.'], ['Unsupported OTP algorithm.', 'Thuật toán OTP không được hỗ trợ.'],
  ['OTP must contain 6 to 8 digits.', 'OTP phải có từ 6 đến 8 chữ số.'], ['Invalid OTP period.', 'Chu kỳ OTP không hợp lệ.'],
  ['Aegis Vault encountered an unknown error.', 'Aegis Vault gặp lỗi không xác định.']
].map(([en, vi]) => [en, { en, vi }]));

const ADDITIONAL_UI_TEXT = [
  // Shared controls and language menus.
  ['Change language', 'Đổi ngôn ngữ / Change language'], ['Change language', 'Đổi ngôn ngữ'],
  ['🇻🇳 Vietnamese', '🇻🇳 Tiếng Việt'], ['🇬🇧 English', '🇬🇧 Tiếng Anh'],
  ['Buy me a coffee', 'Mời tôi một ly cà phê'], ['Help', 'Trợ giúp'],
  ['Show/Hide password', 'Hiện/Ẩn mật khẩu'], ['Close', 'Đóng'], ['Details', 'Chi tiết'],

  // Popup and credential details.
  ['Scan screen', 'Quét màn hình'], ['Import QR image', 'Import ảnh QR'],
  ['Scan or import a QR code', 'Quét hoặc import mã QR'], ['Open QR scanning choices', 'Mở lựa chọn quét mã QR'],
  ['Open Dashboard / Settings', 'Mở Dashboard / Cài đặt'], ['Open Dashboard', 'Mở Dashboard'],
  ['Profile', 'Hồ sơ'], ['Open profile', 'Mở hồ sơ'], ['Lock Vault', 'Khóa vault'],
  ['Opening Aegis Vault', 'Đang mở Aegis Vault'], ['Opening Vault…', 'Đang mở Vault…'],
  ['⚠️ Firebase sync error', '⚠️ Lỗi đồng bộ Firebase'], ['Updated', 'Cập nhật'],
  ['Generate a new password', 'Tạo mật khẩu mới'], ['Length:', 'Độ dài:'], ['characters', 'ký tự'],
  ['Uppercase (A-Z)', 'Chữ hoa (A-Z)'], ['Lowercase (a-z)', 'Chữ thường (a-z)'],
  ['Numbers (0-9)', 'Chữ số (0-9)'], ['Symbols (!@#...)', 'Ký tự đặc biệt (!@#...)'],
  ['⚙ Advanced settings', '⚙ Cài đặt nâng cao'],
  ['Setup URI (optional)', 'URI thiết lập (không bắt buộc)'],
  ['Paste a URI to fill the form quickly. The visible fields below are always the data that will be saved.', 'Dán URI để điền nhanh. Các trường hiển thị bên dưới luôn là dữ liệu được lưu.'],
  ['Service', 'Dịch vụ'], ['Algorithm', 'Thuật toán'], ['Digits', 'Số chữ số'], ['Period (seconds)', 'Chu kỳ (giây)'],
  ['Delete this OTP code', 'Xóa mã OTP này'], ['Confirm OTP deletion', 'Xác nhận xóa mã OTP'],
  ['Do you want to delete this OTP code?', 'Bạn có đồng ý xóa mã OTP này không?'],
  ['Select QR region', 'Khoanh vùng QR'], ['QR image', 'Ảnh QR'],
  ['The QR code contains the OTP secret. Scan it only with a trusted device and do not share this image.', 'QR chứa secret OTP. Chỉ quét bằng thiết bị tin cậy và không chia sẻ ảnh này.'],
  ['SECURE LOGIN', 'TÀI KHOẢN BẢO MẬT'], ['USERNAME', 'TÊN ĐĂNG NHẬP'], ['PASSWORD', 'MẬT KHẨU'],
  ['Copy username', 'Sao chép tên đăng nhập'], ['Copy password', 'Sao chép mật khẩu'],
  ['Edit login', 'Sửa thông tin'], ['GENERAL INFORMATION', 'Thông tin chung'],
  ['ACCOUNT INFORMATION', 'Thông tin tài khoản'], ['OTP INFORMATION', 'Thông tin OTP'],
  ['ADDITIONAL NOTES', 'Ghi chú bổ sung'], ['OTP service', 'Dịch vụ OTP'],
  ['OTP account', 'Tài khoản OTP'], ['OTP secret (Base32)', 'Mã bí mật OTP (Base32)'],
  ['For example: Microsoft OTP Outlook', 'Ví dụ: Microsoft OTP Outlook'],
  ['For example: email@example.com', 'Ví dụ: email@example.com'],
  ['Enter OTP secret', 'Nhập mã bí mật OTP'],
  ['Enter the service, account, and Base32 secret; or paste an otpauth:// URI for Aegis to detect automatically.', 'Nhập đủ Dịch vụ, Tài khoản và mã Base32; hoặc dán URI otpauth:// để Aegis tự nhận diện.'],
  ['Secure notes', 'GHI CHÚ BẢO MẬT'], ['Secure note', 'Ghi chú bảo mật'],
  ['Secure Notes', '📝 Ghi chú bảo mật (Secure Notes)'], ['Add new note', '+ Thêm ghi chú mới'],
  ['Payment Cards', '💳 Thẻ thanh toán (Credit / Debit Cards)'], ['Trash', '🗑️ Thùng rác (Recycle Bin)'],
  ['Delete login', 'Xóa thông tin'], ['Delete login', '🗑️ Xóa thông tin'], ['Add new card', '+ Thêm thẻ mới'],
  ['Notes', 'Ghi chú'], ['Secure notes…', 'Ghi chú bảo mật...'],
  ['Note title', 'Tiêu đề ghi chú'], ['For example: Google recovery codes, OpenAI API key…', 'VD: Mã Recovery Google, Khóa API OpenAI...'],
  ['Secure content', 'Nội dung bảo mật'], ['Enter the secret content to store…', 'Nhập nội dung bí mật cần lưu trữ...'],
  ['📋 Copy content', '📋 Sao chép nội dung'], ['Copy OTP code', 'Sao chép mã OTP'],

  // Payment-card editor.
  ['Bank name', 'Tên ngân hàng'], ['Cardholder name (as printed on card)', 'Tên chủ thẻ (In trên thẻ)'],
  ['Card number (16 digits)', 'Số thẻ (16 chữ số)'], ['Expiry month (MM)', 'Tháng hết hạn (MM)'],
  ['Expiry year (YY/YYYY)', 'Năm hết hạn (YY/YYYY)'], ['CVV', 'Mã CVV'],
  ['PAYMENT CARD', 'THẺ THANH TOÁN'], ['CARDHOLDER', 'CHỦ THẺ'],
  ['Copy card number', 'Sao chép số thẻ'], ['Copy cardholder name', 'Sao chép tên chủ thẻ'],
  ['Copy card expiry', 'Sao chép hạn thẻ'], ['Copy CVV', 'Sao chép mã CVV'],

  // Identity and master-password settings.
  ['Linked Google account', 'Tài khoản Google liên kết'],
  ['Google OIDC authentication identifies and verifies the Vault owner.', 'Thông tin xác thực Google OIDC dùng làm định danh xác minh chủ sở hữu vault.'],
  ['Not signed in', 'Chưa đăng nhập'],
  ['Select the Aegis Vault toolbar icon to link your Google account.', 'Hãy click biểu tượng Aegis Vault ở thanh công cụ trình duyệt để liên kết.'],
  ['Change master password', 'Đổi mật khẩu chính'],
  ['Change the master password used to encrypt and decrypt your local Vault.', 'Thay đổi mật khẩu chính dùng để mã hóa và giải mã kho mật khẩu cục bộ của bạn.'],
  ['Current master password', 'Mật khẩu chính hiện tại'],
  ['New master password (minimum 6 characters)', 'Mật khẩu chính mới (tối thiểu 6 ký tự)'],
  ['Confirm new master password', 'Xác nhận mật khẩu chính mới'],
  ['Update master password', 'Cập nhật mật khẩu chính'],

  // Security Center.
  ['Security score', 'Điểm an toàn'], ['Analyzing', 'Đang phân tích'],
  ['Passwords are evaluated locally during the unlocked session. No data is sent outside.', 'Mật khẩu được đánh giá cục bộ trong phiên đang mở khóa. Không dữ liệu nào được gửi ra ngoài.'],
  ['Password strength distribution', 'Phân bố độ mạnh mật khẩu'],
  ['Unlock the Vault to start the analysis.', 'Hãy mở khóa Vault để bắt đầu phân tích.'],
  ['Strong passwords', 'Mật khẩu mạnh'], ['Weak passwords', 'Mật khẩu yếu'],
  ['Currently reused', 'Đang dùng lại'], ['Needs attention', 'Cần xử lý'],
  ['Account', 'Tài khoản'], ['Strength', 'Độ mạnh'], ['Risk', 'Rủi ro'],
  ['No passwords in this group.', 'Không có mật khẩu trong nhóm này.'],
  ['All', 'Tất cả'],

  // Import, export, backup, and restore settings.
  ['Data import / export tools', 'Công cụ nhập / xuất dữ liệu'],
  ['Vault backup and restore', 'Backup và khôi phục Vault'],
  ['CSV import / export', 'Nhập / xuất CSV'], ['OTP TXT import / export', 'Nhập / xuất OTP TXT'],
  ['Full encrypted Vault backup', 'Backup toàn bộ Vault đã mã hóa'],
  ['Create a complete copy containing accounts and OTP codes. The backup remains protected by the master password.', 'Tạo một bản sao đầy đủ gồm tài khoản và mã OTP. Nội dung backup vẫn được bảo vệ bằng mật khẩu chính.'],
  ['Keep the backup file and master password in two separate safe locations. A forgotten password cannot be recovered.', 'Giữ tệp backup và mật khẩu chính ở hai nơi an toàn khác nhau. Không thể khôi phục nếu quên mật khẩu.'],
  ['Download encrypted backup', 'Tải backup mã hóa'],
  ['Use this copy to move the Vault to another device or recover after a Firebase problem.', 'Dùng bản này để chuyển Vault sang máy khác hoặc khôi phục khi Firebase gặp sự cố.'],
  ['Enter master password', 'Nhập mật khẩu chính'],
  ['Master password', 'Mật khẩu chính'],
  ['Restore from backup', 'Khôi phục từ backup'],
  ['The file data will replace the current Vault and then sync again. Verify the file before continuing.', 'Dữ liệu trong tệp sẽ thay thế Vault hiện tại rồi được đồng bộ lại. Hãy kiểm tra đúng tệp trước khi tiếp tục.'],
  ['Choose backup file', 'Chọn tệp backup'], ['No file selected', 'Chưa chọn tệp'],
  ['A .json or .aegis file created by Aegis Vault', 'Tệp .json hoặc .aegis do Aegis Vault tạo'],
  ['Backup master password', 'Mật khẩu chính của backup'],
  ['Local copy from before Firebase', 'Bản local trước khi dùng Firebase'],
  ['Aegis kept the previous local copy encrypted. Download it before clearing data; restoring it requires that copy\'s old master password.', 'Aegis đã giữ lại bản local cũ ở dạng mã hóa. Tải tệp này trước khi dọn dữ liệu; khi khôi phục cần mật khẩu chính cũ của bản đó.'],
  ['Download old local copy', 'Tải bản local cũ'],
  ['Import / export CSV', 'Nhập / xuất CSV'],
  ['Import a CSV file into the Vault or export account data as CSV.', 'Nhập tệp CSV vào Vault hoặc xuất dữ liệu tài khoản thành tệp CSV.'],
  ['Choose CSV file', 'Chọn tệp CSV'],
  ['Supported format: .csv · The file is not uploaded to a server', 'Định dạng hỗ trợ: .csv · Tệp không được tải lên máy chủ'],
  ['Import CSV', 'Nhập CSV'], ['Master password for CSV export', 'Mật khẩu chính để xuất CSV'], ['Export CSV', 'Xuất CSV'],
  ['CSV files contain clear-text passwords and preserve data for migration to another password manager. Do not open them in Excel or Google Sheets because website values may be interpreted as formulas.', 'Tệp CSV chứa mật khẩu dạng rõ và giữ nguyên dữ liệu để nhập sang password manager. Không mở tệp bằng Excel hoặc Google Sheets vì nội dung website có thể bị diễn giải như công thức.'],
  ['Import & export OTP codes', 'Nhập & xuất mã OTP'],
  ['Authenticator TXT compatible: each line is an otpauth://totp URI.', 'Tương thích Authenticator TXT: mỗi dòng là một URI otpauth://totp.'],
  ['Choose Authenticator TXT', 'Chọn Authenticator TXT'],
  ['Secrets are processed only locally inside the Vault', 'Secret chỉ được xử lý cục bộ trong Vault'],
  ['Import OTP', 'Nhập OTP'], ['Export OTP TXT', 'Xuất OTP TXT'],
  ['OTP files contain secrets that can generate login codes. Keep the file in a safe place.', 'Tệp OTP chứa secret có thể tạo mã đăng nhập. Hãy giữ tệp ở nơi an toàn.'],
  ['Show OTP secret', 'Hiện mã bí mật OTP'], ['Show/Hide OTP secret', 'Hiện/Ẩn mã bí mật OTP'],
  ['Do you want to delete this item?', 'Bạn có đồng ý xóa thông tin này không?']
].map(([en, vi]) => ({ en, vi }));

const LOCALIZED_PATTERNS = [
  [/^Đã sao chép (.+)$/u, { en: 'Copied $1', vi: 'Đã sao chép $1' }],
  [/^Không thể sao chép (.+)$/u, { en: 'Could not copy $1', vi: 'Không thể sao chép $1' }],
  [/^Ưu tiên thay (\d+) mật khẩu yếu bằng mật khẩu dài và duy nhất\.$/u, { en: 'Replace $1 weak passwords with long, unique passwords first.', vi: 'Ưu tiên thay $1 mật khẩu yếu bằng mật khẩu dài và duy nhất.' }],
  [/^(\d+) tài khoản đang dùng lại mật khẩu\. Hãy tạo mật khẩu riêng cho từng website\.$/u, { en: '$1 accounts reuse passwords. Create a unique password for each website.', vi: '$1 tài khoản đang dùng lại mật khẩu. Hãy tạo mật khẩu riêng cho từng website.' }],
  [/^Nâng cấp (\d+) mật khẩu trung bình lên ít nhất 12–16 ký tự\.$/u, { en: 'Upgrade $1 medium-strength passwords to at least 12–16 characters.', vi: 'Nâng cấp $1 mật khẩu trung bình lên ít nhất 12–16 ký tự.' }],
  [/^Đã xóa (.+)$/u, { en: 'Deleted $1', vi: 'Đã xóa $1' }],
  [/^Đã xuất (\d+) (.+)\.$/u, { en: 'Exported $1 $2.', vi: 'Đã xuất $1 $2.' }],
  [/^Đã nhập (\d+) (.+)\.$/u, { en: 'Imported $1 $2.', vi: 'Đã nhập $1 $2.' }],
  [/^Độ dài phải từ (\d+) ký tự để chứa đủ các nhóm đã chọn\.$/u, { en: 'The length must be at least $1 characters to include every selected group.', vi: 'Độ dài phải từ $1 ký tự để chứa đủ các nhóm đã chọn.' }],
  [/^Kéo (.+) để đổi thứ tự$/u, { en: 'Drag $1 to reorder', vi: 'Kéo $1 để đổi thứ tự' }],
  [/^Hiển thị QR cho (.+)$/u, { en: 'Show QR code for $1', vi: 'Hiển thị QR cho $1' }],
  [/^Sửa (.+)$/u, { en: 'Edit $1', vi: 'Sửa $1' }],
  [/^(\d+) giây mỗi mã$/u, { en: '$1 seconds per code', vi: '$1 giây mỗi mã' }],
  [/^(.+) đã có trong danh sách OTP$/u, { en: '$1 is already in the OTP list', vi: '$1 đã có trong danh sách OTP' }],
  [/^Đã lưu (.+) vào danh sách OTP$/u, { en: 'Saved $1 to the OTP list', vi: 'Đã lưu $1 vào danh sách OTP' }],
  [/^Không đọc được ảnh QR: (.+)$/u, { en: 'Could not read the QR image: $1', vi: 'Không đọc được ảnh QR: $1' }]
  ,[/^Không thể lưu: (.+)$/u, { en: 'Could not save: $1', vi: 'Không thể lưu: $1' }]
  ,[/^Không thể xóa: (.+)$/u, { en: 'Could not delete: $1', vi: 'Không thể xóa: $1' }]
  ,[/^Không thể nhập CSV: (.+)$/u, { en: 'Could not import CSV: $1', vi: 'Không thể nhập CSV: $1' }]
  ,[/^Không thể xuất CSV: (.+)$/u, { en: 'Could not export CSV: $1', vi: 'Không thể xuất CSV: $1' }]
  ,[/^Không thể khôi phục: (.+)$/u, { en: 'Could not restore: $1', vi: 'Không thể khôi phục: $1' }]
  ,[/^Không thể nhập OTP: (.+)$/u, { en: 'Could not import OTP: $1', vi: 'Không thể nhập OTP: $1' }]
  ,[/^Không thể xuất OTP: (.+)$/u, { en: 'Could not export OTP: $1', vi: 'Không thể xuất OTP: $1' }]
  ,[/^(.+) không hợp lệ\.$/u, { en: 'Invalid $1.', vi: '$1 không hợp lệ.' }]
  ,[/^(.+) không được để trống\.$/u, { en: '$1 is required.', vi: '$1 không được để trống.' }]
  ,[/^(.+) vượt quá dung lượng cho phép\.$/u, { en: '$1 exceeds the allowed size.', vi: '$1 vượt quá dung lượng cho phép.' }]
];

const LEGACY_UI_BY_VALUE = new Map();
for (const pair of [...LEGACY_UI_TEXT.values(), ...ADDITIONAL_UI_TEXT]) {
  LEGACY_UI_BY_VALUE.set(pair.en, pair);
  LEGACY_UI_BY_VALUE.set(pair.vi, pair);
}

export function localizeText(value, lang = currentLang) {
  const raw = String(value ?? '');
  const trimmed = raw.trim();
  const pair = LEGACY_UI_BY_VALUE.get(trimmed);
  if (pair) return raw.replace(trimmed, pair[lang]);

  const statusPrefix = trimmed.match(/^([⚠❌✓✔⌛⏳🎉]+(?:️)?\s*)(.+)$/u);
  if (statusPrefix) {
    const localizedBody = localizeText(statusPrefix[2], lang);
    if (localizedBody !== statusPrefix[2]) {
      return raw.replace(trimmed, `${statusPrefix[1]}${localizedBody}`);
    }
  }

  const separatorIndex = trimmed.indexOf(': ');
  if (separatorIndex > 0) {
    const left = trimmed.slice(0, separatorIndex);
    const right = trimmed.slice(separatorIndex + 2);
    const localizedLeft = localizeText(left, lang);
    const localizedRight = localizeText(right, lang);
    if (localizedLeft !== left || localizedRight !== right) {
      return raw.replace(trimmed, `${localizedLeft}: ${localizedRight}`);
    }
  }

  for (const [pattern, replacement] of LOCALIZED_PATTERNS) {
    if (!pattern.test(trimmed)) continue;
    const localized = trimmed.replace(pattern, replacement[lang]);
    const nested = localized.includes(': ') ? localizeText(localized, lang) : localized;
    return raw.replace(trimmed, nested);
  }
  return raw;
}

const VIETNAMESE_CHARACTERS = /[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/u;

export function localizeRuntimeText(value, lang = currentLang) {
  const localized = localizeText(value, lang);
  if (lang === 'en' && localized === String(value ?? '') && VIETNAMESE_CHARACTERS.test(localized)) {
    return 'Aegis Vault could not complete this action.';
  }
  return localized;
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
    const localized = localizeText(node.nodeValue, lang);
    if (localized !== node.nodeValue) node.nodeValue = localized;
  }
  for (const element of root.querySelectorAll('[title],[aria-label],input[placeholder],textarea[placeholder]')) {
    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const localized = localizeText(current, lang);
      if (localized !== current) element.setAttribute(attribute, localized);
    }
  }
  if (doc.documentElement.lang !== lang) doc.documentElement.lang = lang;
}

export function translateDocument(doc = document) {
  const lang = currentLang;
  const dict = DICTIONARY[lang] || DICTIONARY.en;

  doc.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) {
      if (el.textContent !== dict[key]) el.textContent = dict[key];
    }
  });

  doc.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key] !== undefined) {
      if (el.placeholder !== dict[key]) el.placeholder = dict[key];
    }
  });

  doc.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (dict[key] !== undefined) {
      if (el.title !== dict[key]) el.title = dict[key];
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
        if (typeof onLangChange === 'function') onLangChange(currentLang);
      }
    });
  }

  if (typeof MutationObserver !== 'undefined' && document?.body && !document.body.dataset.i18nObserver) {
    document.body.dataset.i18nObserver = 'active';
    let translating = false;
    const observerOptions = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] };
    const observer = new MutationObserver(() => {
      if (translating) return;
      translating = true;
      queueMicrotask(() => {
        observer.disconnect();
        try {
          translateDocument();
        } finally {
          observer.takeRecords();
          observer.observe(document.body, observerOptions);
          translating = false;
        }
      });
    });
    observer.observe(document.body, observerOptions);
  }

  return currentLang;
}
