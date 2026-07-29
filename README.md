# Aegis Vault

Aegis Vault 0.3.17 là extension quản lý mật khẩu local-first cho Google Chrome và Microsoft Edge. Vault được mã hóa bằng AES-256-GCM; khóa mã hóa được dẫn xuất từ mật khẩu chính bằng PBKDF2-SHA-256 với 600.000 vòng.

## Tính năng

- Lưu mật khẩu và OTP trong vault mã hóa trên máy.
- Tự nhận diện đúng `scheme + hostname + port`; không gợi ý chéo giữa các subdomain.
- Điền tài khoản sau thao tác trực tiếp của người dùng, không tự submit biểu mẫu.
- Đồng bộ bản mã hóa qua vùng AppData riêng của Google Drive.
- Hiển thị trạng thái đồng bộ, phát hiện nhánh dữ liệu/ghi đồng thời và yêu cầu chọn bản muốn giữ thay vì ghi đè âm thầm.
- Khi chọn dùng bản Drive có mật khẩu khác, giữ lại bản local cũ ở dạng mã hóa và cho phép tải xuống làm tệp phục hồi.
- Import/export CSV, import/export OTP và backup toàn bộ vault ở dạng mã hóa.
- Đánh dấu mục yêu thích, chỉnh tham số OTP, quét QR bằng vùng chọn màn hình hoặc import ảnh QR để tự lưu thẳng vào vault.
- Tự chuyển dữ liệu vault cũ từ `chrome.storage.sync` sang `chrome.storage.local` khi đọc thấy bản hợp lệ.

## Cài đặt thử nghiệm

Yêu cầu Google Chrome 106 trở lên hoặc Microsoft Edge dùng Chromium tương đương.

1. Mở `chrome://extensions/` trên Chrome hoặc `edge://extensions/` trên Edge.
2. Bật **Chế độ dành cho nhà phát triển**.
3. Chọn **Tải tiện ích đã giải nén** và trỏ tới thư mục dự án.
4. Mở Aegis Vault, đăng nhập Google một lần và tạo vault bằng một câu mật khẩu chính mạnh, dài ít nhất 12 ký tự.

Khi đóng rồi mở lại trình duyệt, Aegis dùng phiên Google còn hiệu lực để cấp lại access token ngắn hạn ở chế độ im lặng. Nếu người dùng không đăng xuất, không thu hồi quyền và không xóa cookie Google khi đóng trình duyệt, Chrome và Edge chỉ yêu cầu nhập lại mật khẩu chính để giải mã vault.

Chrome và Edge cùng dùng luồng `chrome.identity.launchWebAuthFlow` với OAuth Client ID của Aegis trong `manifest.json`. Mỗi Gmail chỉ truy cập vùng Drive AppData riêng của chính tài khoản đó. OAuth client Web application phải có redirect URI của cả hai Extension ID trong danh sách **Authorized redirect URIs**.

## Nguyên tắc bảo mật

- Mật khẩu chính không được ghi vào ổ đĩa hoặc Google Drive; khi vault mở, nó chỉ tồn tại trong `chrome.storage.session`.
- Trên cả Chrome và Edge, access token ngắn hạn chỉ được giữ trong `chrome.storage.session` (bộ nhớ phiên), không được lưu lâu dài trong `chrome.storage.local` hay `sync`.
- Trước khi truy cập Drive, subject của token được đối chiếu lại với tài khoản sở hữu vault để tránh đồng bộ nhầm khi tài khoản Chrome thay đổi.
- Dữ liệu gửi lên Drive luôn là envelope đã mã hóa và có xác thực.
- Storage của extension được giới hạn cho trusted extension contexts.
- Content script chỉ chạy trên HTTPS; HTTP chỉ được cho phép với `localhost` và `127.0.0.1` để phát triển.
- Autofill và message routing kiểm tra lại origin ở background trước khi trả credential.
- Giao diện gợi ý trên website dùng closed Shadow DOM và chỉ xử lý thao tác người dùng đáng tin cậy.
- Không có auto-lock theo thời gian. Vault chỉ khóa khi bấm **Khóa**, đăng xuất Google, reload extension hoặc kết thúc phiên trình duyệt.

## Backup và khôi phục

Trong trang **Quản lý**, chọn xuất backup mã hóa và giữ tệp ở nơi an toàn. Khi khôi phục, Aegis Vault kiểm tra cấu trúc, xác thực mật khẩu backup, kiểm tra chủ sở hữu Google rồi mới thay thế vault hiện tại.

Nếu Aegis phải thay bản local bằng một bản Drive dùng mật khẩu khác, trang **Quản lý → Cài đặt** sẽ hiện nút tải bản local cũ. Tệp này vẫn được mã hóa và cần đúng mật khẩu chính cũ khi khôi phục.

Mật khẩu chính không thể khôi phục nếu bị quên. Nên giữ ít nhất một backup mã hóa độc lập với Google Drive.

CSV chỉ dành cho việc chuyển dữ liệu sang password manager khác: tệp chứa mật khẩu dạng rõ và không nên mở bằng Excel hoặc Google Sheets. Để sao lưu hằng ngày, ưu tiên backup `.aegis` đã mã hóa.

## Kiểm thử và đóng gói

```powershell
npm test
npm run check
.\scripts\package-extension.ps1
```

Gói portable được tạo tại `dist/aegis-vault.zip`. Xem thêm [INSTALL.md](INSTALL.md) để cài trên máy khác và giữ ổn định Extension ID cho Google OAuth.

> Đây vẫn là phần mềm tự quản lý mật khẩu. Hãy kiểm thử kỹ trong môi trường của bạn và giữ backup trước khi dùng làm nơi lưu duy nhất cho dữ liệu quan trọng.
