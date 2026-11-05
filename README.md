# C A N Badminton · Smash & Share 2026

PWA chạy hoàn toàn trên GitHub Pages và không gọi API bên ngoài. Tệp `app.js` giữ tương thích khóa dữ liệu cũ `can-badminton-v1` trong `localStorage` để các bản ghi đã có trên cùng trình duyệt vẫn còn sau khi nâng cấp.

## Chức năng

- Ghi, xem, sửa, chuyển vào thùng rác và khôi phục trận đấu / khoản quyên góp.
- Tính đóng quỹ trước khi lưu và tính lại thống kê từ các bản ghi còn hiệu lực.
- Hai kiểu trận: hai hội trực tiếp và đánh đôi xen kẽ.
- Danh sách người chơi, sân, thống kê theo hội / nhóm và theo người.
- Nhật ký thao tác trên thiết bị.
- Sao lưu và nhập tệp JSON để chuyển dữ liệu giữa trình duyệt hoặc điện thoại.
- Có thể cài PWA lên màn hình chính và dùng ngoại tuyến.

## Công thức quỹ

Giá trị mặc định là 1 điểm = 1.000đ. Có thể đổi trong **Khác → Đơn vị tính quỹ**.

- **Hai hội đấu trực tiếp:** mỗi người bên A đóng một nửa số điểm bên B × đơn vị; mỗi người bên B đóng một nửa số điểm bên A × đơn vị.
- **Đánh đôi xen kẽ:** mỗi người đóng một nửa số điểm đội mình × đơn vị. Khi mỗi đội có một người của mỗi hội, tổng đóng góp của hai hội bằng nhau.
- Tổng quỹ, thống kê hội và thống kê cá nhân được tính từ trận còn hiệu lực. Xóa mềm đưa bản ghi vào thùng rác; khôi phục tính bản ghi trở lại.

## Lưu trữ và quyền truy cập

> **Dữ liệu nằm trên từng trình duyệt / thiết bị.** GitHub Pages chỉ phân phối tệp tĩnh nên bản ghi không tự đồng bộ giữa các quản lý. Xuất bản sao lưu trước khi đổi thiết bị, xóa dữ liệu trình duyệt hoặc chuyển tài khoản. Nhập bản sao lưu sẽ gộp theo ID.

Website tĩnh không thể bảo vệ quyền quản lý ở backend. Tên người nhập được lưu trong nhật ký để tiện đối chiếu, nhưng không phải xác thực danh tính. Mọi người dùng thiết bị đó có thể truy cập dữ liệu trên thiết bị. Không lưu thông tin mà bạn không muốn giữ trong bộ nhớ trình duyệt.

## Dùng trên Android

1. Mở `https://canbadminton.github.io/` bằng Chrome.
2. Chọn ngày, đăng ký người chơi, rồi ghi trận hoặc khoản quyên góp.
3. Dùng **Khác → Xuất bản sao lưu** để lưu tệp JSON ở nơi an toàn. Trên điện thoại mới, chọn **Nhập bản sao lưu**.
4. Cài ứng dụng bằng nút tải xuống nếu Chrome hiển thị, hoặc menu ⋮ → **Thêm vào màn hình chính**.

## Phát hành

Commit lên nhánh `main` sẽ tiếp tục dùng cấu hình GitHub Pages hiện tại và URL website không đổi. Khi cập nhật PWA, tăng tên cache trong `sw.js` để trình duyệt nhận mã mới.

