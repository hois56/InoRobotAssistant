# Lịch sử phiên bản công cụ gỡ lỗi

## communicationTester

### Ver 2.6 (2026.06.15)

- **[Thay đổi]** Thiết kế lại màn hình HMI mặc định theo chương trình chuẩn hóa.
- **[Thay đổi]** Nhúng HMI mặc định mới nhất vào chương trình, không cần tệp riêng.
- **[Cải tiến]** HMI mặc định nhúng được áp dụng tự động khi khởi động.

### Ver 2.5 (2026.06.10)

- **[Mới]** Thêm hệ thống script vào HMI Code Block.
- **[Thêm]** Thêm điều kiện If / ElseIf / Else / EndIf.
- **[Thêm]** Thêm phép logic, so sánh, số học và lệnh Delay.
- **[Thêm]** Script có thể đọc và ghi giá trị địa chỉ truyền thông.
- **[Thêm]** Thêm tự động hoàn thành, tô sáng cú pháp và kiểm tra lỗi.
- **[Thêm]** Thêm kiểu dữ liệu Byte và BitField.
- **[Thêm]** Có thể mở rộng Word thành các hàng Bit và Byte.
- **[Cải tiến]** Ghi nhiều địa chỉ xử lý đúng kiểu dữ liệu của từng đích.
- **[Cải tiến]** Cải thiện tương thích với tệp HMI hiện có.

### Ver 2.4 (2026.04.26)

- **[Thay đổi]** Chuyển thành ứng dụng độc lập chạy không cần cài riêng .NET runtime.
- **[Thay đổi]** Gộp chương trình và thành phần bắt buộc vào một tệp chạy.
- **[Sửa]** Sửa điểm khởi động và thiết lập đường dẫn triển khai.
- **[Cải tiến]** Cải thiện độ ổn định khi chạy và triển khai.

### Ver 2.3 (2026.04.13)

- **[Thêm]** Thêm so sánh điều kiện và thực thi cho HMI Word Button.
- **[Thêm]** Thêm ghi nhiều để điều khiển tối đa 10 địa chỉ bằng một nút.
- **[Thay đổi]** Có thể cấu hình riêng đích điều kiện và đích thực thi.
- **[Cải tiến]** Cải thiện hiển thị trạng thái và kích hoạt HMI.

### Ver 2.2 (2026.04.02)

- **[Mới]** Phát hành Communication Tester trên trang web.
- **[Thêm]** Thêm truyền thông Modbus TCP.
- **[Thêm]** Thêm truyền thông EtherNet/IP.
- **[Thêm]** Thêm truyền thông MC Protocol.
- **[Thêm]** Thêm TCP/IP Socket Client và Server.
- **[Thêm]** Thêm giám sát và điều khiển dữ liệu truyền thông thời gian thực.
- **[Thêm]** Thêm HMI Builder để tạo màn hình kiểm thử trên PC.

## labelGenerator

### Ver 2.1.0

- **[Sửa]** Ngăn nhãn Bit, Byte hoặc Word bị thiếu hay ghi đè khi dùng cùng địa chỉ.
- **[Thay đổi]** Khi xung đột địa chỉ, ưu tiên nhãn Bit và hiển thị Byte, Word liên quan trong phần mô tả.
- **[Thêm]** Tự nhận dạng Double Word, 2 Word, DWORD và 32-bit trong mô tả.
- **[Sửa]** Dữ liệu Double Word được ghép đúng trong phạm vi 32 bit của Excel.
- **[Thay đổi]** Thống nhất tiêu đề chương trình và phiên bản tệp chạy là V2.1.

### Ver 2.0.0

- **[Mới]** Gộp các định dạng nhãn phát hành riêng thành một chương trình.
- **[Thêm]** Thêm định dạng Word 20 ký tự, Byte 20 ký tự, Word 64 ký tự và Byte 64 ký tự.
- **[Thêm]** Có thể chọn định dạng riêng cho Excel sang JSN và JSN sang Excel.
- **[Mới]** Thêm màn hình kiểm tra, sửa tên nhãn và mô tả trước khi chuyển JSN sang Excel.
- **[Thêm]** Tự đặt tên tệp Excel theo định dạng đã chọn.
- **[Thay đổi]** Cải thiện chuẩn hóa tên để rút gọn tên biến dài trong định dạng 20 ký tự.
- **[Thay đổi]** Vùng trạng thái hiển thị định dạng hiện tại và số bản ghi đã tải.
- **[Thay đổi]** Đổi mặc định thành Word 20 ký tự.

### Ver 1.0.0

- **[Mới]** Thêm chuyển dữ liệu nhãn Excel sang JSN.
- **[Mới]** Thêm chuyển JSN sang sổ nhãn Excel.
- **[Thêm]** Hỗ trợ nhãn Bit, Byte, Word của Input và Output.
- **[Thêm]** Hỗ trợ nhãn biến B, R và D.
- **[Thêm]** Thêm xem, sắp xếp, chọn và sửa nhãn.
- **[Thêm]** Thêm chuẩn hóa tên biến và xem trước thay đổi.
- **[Thêm]** Hỗ trợ Byte 64 ký tự và Word 20 ký tự.

## trace

### Ver 1.3 (2026.07.15)

- **[Thêm]** Thêm giám sát tốc độ khớp J1 đến J6 theo thời gian thực.

### Ver 1.2 (2026.06.15)

- **[Mới]** Thêm giám sát thời gian thực cho 16 kênh DI và 16 kênh DO.
- **[Thay đổi]** Trạng thái số hiển thị ON / OFF thay vì số.
- **[Cải tiến]** Tối ưu phạm vi đồ thị để dễ thấy chuyển trạng thái DI, DO.
- **[Cải tiến]** Có thể lưu mọi kênh trace đã chọn thành CSV.
- **[Cải tiến]** Tự nhận dạng và hiển thị các kênh trong CSV khi tải.
- **[Cải tiến]** Duy trì tương thích với CSV lưu từ phiên bản cũ.

### Ver 1.1 (2026.05.18)

- **[Thay đổi]** Chỉ thu thập biến B, R, D người dùng chọn thay vì đọc tất cả.
- **[Thêm]** Có thể đổi biến trace B, R, D khi đang chạy.
- **[Cải tiến]** Giảm gọi robot API không cần thiết để lấy mẫu tốc độ cao ổn định và nhanh hơn.
- **[Cải tiến]** Giảm tải truyền thông của robot và chương trình khi trace trực tiếp.

### Ver 1.0 (2026.04.26)

- **[Mới]** Phát hành InoRobotTrace lần đầu.
- **[Mới]** Thêm theo dõi tốc độ TCP và vị trí robot thời gian thực.
- **[Mới]** Thêm giám sát lỗi, mã lỗi, lỗi servo từng trục và dừng khẩn cấp.
- **[Mới]** Thêm giám sát dòng chương trình, dòng chuyển động, thời gian hệ thống và firmware.
- **[Mới]** Thêm giám sát số Tool, Work Object, Load và biến B/R/D.
- **[Mới]** Thêm phóng to, kéo đồ thị, tách kênh và đo bằng con trỏ.
- **[Mới]** Thêm lưu và tải lại dữ liệu trace dạng CSV.
- **[Phân phối]** Cung cấp dưới dạng một tệp chạy không cần cài đặt riêng.

## projectCompare

### Ver 2.1

- **[Thay đổi]** Cập nhật hiển thị cho tỷ lệ Windows 125%, 150% và các mức khác.
- **[Sửa]** Sửa chữ, nút và ô nhập chồng nhau hoặc sai kích thước trên màn hình độ phân giải cao.
- **[Thay đổi]** Chuyển sang một tệp chạy không cần cài .NET riêng.
- **[Thay đổi]** Thống nhất tiêu đề chương trình và phiên bản tệp chạy là V2.1.

### Ver 2.0

- **[Mới]** Thêm so sánh song song hai dự án InoRobot.
- **[Mới]** Thêm tự phân loại tệp .pro, .pts, .jsn và .dat.
- **[Mới]** Hiển thị trạng thái tệp là Khớp / Khác / Chỉ A / Chỉ B.
- **[Mới]** Thêm màn hình tô màu mã và dữ liệu khác nhau.
- **[Mới]** Thêm so sánh dạng bảng và sửa dữ liệu point, label.
- **[Mới]** Thêm ghi đè tệp đã chọn theo hướng A sang B hoặc B sang A.
- **[Mới]** Có thể sửa và lưu tệp trực tiếp trong màn hình so sánh.
- **[Mới]** Thêm Lưu thành để sao chép dự án hiện có.
- **[Thêm]** Hỗ trợ giao diện tiếng Hàn, Anh, Trung và Việt.
