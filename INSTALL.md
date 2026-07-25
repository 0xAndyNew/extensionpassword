# Cài đặt Aegis Vault trên máy tính khác

Aegis Vault không phụ thuộc ổ đĩa, OneDrive, tên người dùng Windows hoặc thư mục cố định. Bạn có thể đặt thư mục extension ở bất kỳ vị trí nào.

## Cài từ thư mục mã nguồn

1. Sao chép toàn bộ thư mục Aegis Vault sang máy mới.
2. Mở `chrome://extensions/`.
3. Bật **Chế độ dành cho nhà phát triển**.
4. Chọn **Tải tiện ích đã giải nén**.
5. Chọn thư mục có tệp `manifest.json`.

Không di chuyển hoặc xóa thư mục này trong khi extension đang được cài. Nếu muốn đổi vị trí, hãy gỡ extension rồi tải lại từ vị trí mới.

## Tạo gói portable

Chạy từ PowerShell tại thư mục dự án:

```powershell
.\scripts\package-extension.ps1
```

Gói được tạo tại `dist/aegis-vault.zip`. Giải nén ZIP trên máy khác rồi chọn thư mục đã giải nén bằng **Tải tiện ích đã giải nén**.

## Google OAuth và Extension ID

Google OAuth sử dụng redirect URI do Chrome tạo:

```text
https://<extension-id>.chromiumapp.org/
```

OAuth hiện tại đã cấu hình cho ID:

```text
dakldaoginnhlfffbcninmmcjepopkgg
```

và redirect URI:

```text
https://dakldaoginnhlfffbcninmmcjepopkgg.chromiumapp.org/
```

Đường dẫn thư mục có thể thay đổi, nhưng Extension ID phải giữ nguyên. Cách ổn định nhất là phát hành extension qua Chrome Web Store. Chrome Web Store giữ cùng một ID trên mọi máy và tự động cập nhật.

Nếu chỉ cài nội bộ bằng **Tải tiện ích đã giải nén**, cần public key tương ứng với ID trên trong trường `key` của `manifest.json`. Private key gốc phải được giữ bên ngoài mã nguồn và không được chia sẻ. Không thể tạo khóa mới mà vẫn giữ nguyên ID cũ.

## Đồng bộ dữ liệu

Sau khi cài trên máy mới:

1. Đăng nhập đúng tài khoản Google.
2. Cấp quyền Google Drive AppData.
3. Nhập mật khẩu chính của vault.
4. Extension tải vault mã hóa của tài khoản từ Google Drive AppData.

Mật khẩu chính không được lưu trên Google Drive và không thể khôi phục nếu bị quên.
