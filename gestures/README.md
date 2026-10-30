# Thao tác trình phát

Tên khi cài: *Motchill - thao tác trình phát* (phiên bản 1.6.1).

Thêm cử chỉ cho trình phát phim trên **Motchill** (motchillsa.com): chạm 2 lần để tua 10 giây, giữ ngón tay để xem nhanh x2, khóa màn hình khi xem toàn màn hình để lỡ chạm cũng không dừng phim, nút bỏ qua giới thiệu và nút tập tiếp theo.

## Dùng được trên

| Android (Firefox) | iPhone, iPad | Máy tính (Chrome) |
| :---: | :---: | :---: |
| Có | Không | Có |

Trên iPhone, khi xem toàn màn hình, máy chuyển sang trình phát riêng của Apple, nên các cử chỉ này không hoạt động. Vì vậy không cần cài script này trên iPhone.

Chỉ chạy trên server **VIP #1**. Server VIP #2 là trình phát của trang khác nên không có các cử chỉ này.

## Cài đặt

Link cài đặt:

```
https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/gestures/motchill-gestures.user.js
```

Các bước cài trên Android và máy tính có trong [hướng dẫn chung](../README.md).

## Cách dùng

### Tua 10 giây

**Chạm 2 lần** vào nửa phải khung phim để tới 10 giây, vào nửa trái để lùi 10 giây. Chạm tiếp để tua thêm 10 giây mỗi lần. Khi tua, một nhãn nhỏ nền mờ hiện **10s »** hoặc **« 10s**.

<img src="../docs/images/use-03-seek-forward.png" width="320" alt="Tua tới 10 giây"> <img src="../docs/images/use-04-seek-back.png" width="320" alt="Lùi 10 giây">

### Xem nhanh x2

**Giữ ngón tay** trên phim: phim chạy nhanh gấp đôi. Thả tay ra là về tốc độ thường. Phía trên khung phim hiện nhãn **2x** với ba mũi tên sáng lần lượt.

<img src="../docs/images/use-02-hold-2x.png" width="320" alt="Giữ ngón tay để xem x2">

### Khóa màn hình

Chỉ có khi xem toàn màn hình.

1. Chạm 1 lần vào phim để hiện thanh điều khiển. Ổ khóa tròn hiện cùng lúc ở mép trái màn hình.
2. Bấm vào ổ khóa để khóa.

<img src="../docs/images/use-05-lock-button.png" width="560" alt="Ổ khóa ở mép trái khi xem toàn màn hình">

Khi đã khóa:

- Thanh điều khiển ẩn hết. Không dừng phim và không thoát toàn màn hình được, nên lỡ chạm cũng không sao.
- Vẫn tua 10 giây và giữ để xem x2 như thường.
- Chạm 1 lần vào phim để hiện ổ khóa, chạm lần nữa để ẩn. Ổ khóa tự ẩn sau khoảng 2,5 giây.
- Muốn mở khóa: bấm vào ổ khóa khi nó đang hiện.
- Bấm nút Quay lại của điện thoại để thoát toàn màn hình cũng sẽ mở khóa.

<img src="../docs/images/use-06-locked.png" width="560" alt="Đã khóa: màn hình chỉ còn ổ khóa">

### Bỏ qua giới thiệu và tập tiếp theo

Một nút nhỏ nền mờ hiện ở góc phải, ngay trên thanh thời gian:

- **Bỏ qua giới thiệu**: ban đầu hiện từ đầu phim tới 1:25, bấm là tua tới 1:30. Nếu sau khi bấm bạn tua chỉnh trong 15 giây, script sẽ nhớ chỗ hết giới thiệu của phim đó cho các tập sau. Chỉ dùng cho phim có giới thiệu ở đầu tập.
- **Tập tiếp theo**: ban đầu hiện trong 3 phút cuối, nếu còn tập sau. Bấm là mở tập kế tiếp và nhớ đoạn cuối phim còn dài bao lâu. Script lấy mốc giữa 5 lần gần nhất; ở các tập sau, nút hiện sớm hơn mốc đó 30 giây.

Trong menu ☰ (điện thoại) và ngay dưới khung phim, cạnh khung **Đổi server**, có mục **TỰ CHUYỂN TẬP** (mặc định tắt). Khi bật và đã nhớ đoạn cuối, tới cuối phim nút sẽ đếm ngược 5 giây rồi sang tập; chạm vào nút để ở lại tập này. Dữ liệu đã nhớ lưu trên từng máy, xóa dữ liệu trang thì sẽ mất.

Đang xem toàn màn hình thì sang tập sau vẫn ở toàn màn hình, kể cả khi hết tập tự chuyển.

Nút vẫn hiện khi thanh điều khiển đã ẩn, nên chỉ cần chạm 1 lần. Khi màn hình đang khóa, chỉ còn nút **Tập tiếp theo**.

## Lưu ý

- Không tua được, không xem x2 được: kiểm tra bạn đang chọn server **VIP #1**.
- Không thấy ổ khóa: ổ khóa chỉ có khi xem toàn màn hình. Chạm 1 lần vào phim để hiện.
- Thoát app hoặc cửa sổ nhỏ (PiP) có thể làm trình duyệt thoát toàn màn hình. Khi quay lại, chạm 1 lần vào phim để xem toàn màn hình tiếp; trình duyệt không cho trang tự bật lại khi chưa chạm.
- Script chạy trên mọi tên miền có chữ *motchill*, nên trang đổi tên miền vẫn dùng được. Script chỉ có tác dụng với bản trang dùng trình phát như motchillsa.com.
