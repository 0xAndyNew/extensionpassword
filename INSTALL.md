# Cài đặt Aegis Vault trên máy tính khác

Aegis Vault không phụ thuộc ổ đĩa, tên người dùng Windows hoặc thư mục cố định. Thư mục extension có thể đặt ở bất kỳ vị trí nào, nhưng không nên di chuyển sau khi đã tải vào Chrome.

Yêu cầu Google Chrome 106 trở lên hoặc Microsoft Edge dùng Chromium tương đương.

## Cài từ thư mục mã nguồn

1. Sao chép toàn bộ thư mục Aegis Vault sang máy mới.
2. Mở `chrome://extensions/` trên Chrome hoặc `edge://extensions/` trên Edge.
3. Bật **Chế độ dành cho nhà phát triển**.
4. Chọn **Tải tiện ích đã giải nén**.
5. Chọn thư mục có tệp `manifest.json`.

Sau mỗi lần cập nhật mã nguồn, mở lại `chrome://extensions/` và bấm **Tải lại** trên thẻ Aegis Vault.

## Tạo gói portable

Chạy từ PowerShell tại thư mục dự án:

```powershell
.\scripts\package-extension.ps1
```

Giải nén `dist/aegis-vault.zip` trên máy khác rồi tải thư mục đã giải nén vào Chrome. Script đóng gói sẽ dừng nếu phát hiện tệp khóa riêng `.pem` hoặc `.key`.

## Google OAuth trên Chrome và Edge

Aegis Vault dùng `chrome.identity.launchWebAuthFlow` trên cả Chrome và Edge với OAuth Web Client trong `manifest.json`. Extension ID hiện tại trên Chrome là:

```text
dakldaoginnhlfffbcninmmcjepopkgg
```

Chrome tạo Extension ID từ public key của extension. Vì `manifest.json` hiện chưa chứa trường `key`, bản **Load unpacked** ở máy khác có thể nhận ID mới và Google đăng nhập sẽ không hoạt động với OAuth Client hiện tại.

Để phát hành ổn định, dùng một trong hai cách:

1. Phát hành qua Chrome Web Store để cùng một extension giữ nguyên ID trên mọi máy.
2. Với cài đặt nội bộ, thêm đúng public key gốc vào trường `key` của `manifest.json` trước khi đóng gói.

Không đưa private key `.pem` vào mã nguồn hoặc gói ZIP. Không thể tạo một cặp khóa mới mà vẫn giữ nguyên ID cũ.

### Cấu hình Microsoft Edge

Microsoft Edge không hỗ trợ `chrome.identity.getAuthToken`, còn API đó trên Chrome yêu cầu OAuth client loại Chrome Extension. Để dùng chung một OAuth Web Client, Aegis từ 0.3.1 dùng `chrome.identity.launchWebAuthFlow` thống nhất trên cả hai trình duyệt.

OAuth Client ID hiện có trong `manifest.json` đã là loại **Web application**. Không tạo Client ID mới và không yêu cầu người dùng nhập cấu hình theo từng tài khoản.

1. Mở OAuth client hiện tại trong **Google Cloud Console → Google Auth Platform → Clients**.
2. Thêm chính xác hai URI sau vào **Authorized redirect URIs**:

```text
https://dakldaoginnhlfffbcninmmcjepopkgg.chromiumapp.org/oauth2
https://afdjllbghpnclbhipjbjohhdeiapicnc.chromiumapp.org/oauth2
```

3. Lưu OAuth client.
4. Tải lại extension trên Edge, mở popup Aegis và đăng nhập Gmail cần quản lý.

Mỗi Gmail có vùng Drive AppData riêng. Đăng nhập Gmail nào thì Aegis chỉ quản lý vault thuộc Gmail đó; cùng một Gmail trên Chrome và Edge sẽ thấy cùng vault. Nếu Edge Extension ID thay đổi sau khi tải lại từ thư mục khác, redirect URI cũng thay đổi và phải được cập nhật trên Google Cloud.

## Đăng nhập lại sau khi đóng trình duyệt

Sau lần cấp quyền đầu tiên, cả Chrome và Edge chỉ giữ access token ngắn hạn trong bộ nhớ phiên và tự xin lại token ở chế độ im lặng qua phiên Google của trình duyệt. Khi mở lại:

1. Hồ sơ trình duyệt hoặc phiên Google trên `accounts.google.com` phải vẫn đăng nhập cùng tài khoản.
2. Người dùng không được bấm **Đăng xuất** trong Aegis Vault hoặc thu hồi quyền ứng dụng.
3. Extension ID phải giữ nguyên.
4. Chỉ cần nhập lại mật khẩu chính để mở vault.

Nếu Chrome vẫn yêu cầu đăng nhập Google lại, kiểm tra trước tiên xem Extension ID có thay đổi sau khi tải lại extension hay không. Nếu Edge yêu cầu kết nối lại, kiểm tra Web Client ID, redirect URI và cookie phiên Google; không bật chế độ xóa toàn bộ cookie khi đóng Edge.

## Đồng bộ và khôi phục dữ liệu

Trên máy mới:

1. Đăng nhập đúng tài khoản Google đã sở hữu vault.
2. Cấp quyền Google Drive AppData khi Chrome hỏi.
3. Chờ trạng thái đồng bộ hoàn tất.
4. Nhập mật khẩu chính của vault.

Nếu Drive chưa có bản dữ liệu, Aegis Vault sẽ giữ vault local và yêu cầu mở khóa trước khi tải lên. Nếu local và Drive là hai nhánh dữ liệu khác nhau, trang **Quản lý** sẽ yêu cầu chọn **Giữ bản trên máy** hoặc **Dùng bản trên Drive**; extension không tự ghi đè âm thầm.

Khi chọn **Dùng bản trên Drive**, Aegis kiểm tra lại phiên bản Drive ngay trước khi thay thế. Nếu mật khẩu của hai bản khác nhau, bản local cũ được giữ nguyên ở dạng mã hóa và có thể tải xuống tại **Quản lý → Cài đặt**; cần mật khẩu chính cũ để khôi phục tệp đó.

Có thể khôi phục bằng tệp backup mã hóa từ trang **Quản lý**. Backup chỉ được chấp nhận sau khi kiểm tra cấu trúc, giải mã đúng mật khẩu và xác minh vault thuộc đúng tài khoản Google.

Mật khẩu chính không được lưu trên Google Drive và không thể khôi phục nếu bị quên.
