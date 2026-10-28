const fs = require('fs');

let content = fs.readFileSync('google_apps_script.js', 'utf8');

// Replace DEFAULT_WORKERS
content = content.replace(
  /var DEFAULT_WORKERS = \[\s*\{ name: "Hoàng Ngọc Hà", code: "NV01"[\s\S]*?\{ name: "Đặng Ngọc Long", code: "NV15"[^\n]*\}\s*\];/,
  `var DEFAULT_WORKERS = [
      { name: "Hoàng Ngọc Hà", code: "NV00053", oldCode: "NV01", chatId: "5422717407", user: "hoangha", role: "Quản Đốc" },
      { name: "Nguyễn Trung Đông", code: "NV00218", oldCode: "NV02", chatId: "7154329103", user: "trungdong", role: "Thợ CNC" },
      { name: "Phùng Đình Hùng", code: "NV00282", oldCode: "NV03", chatId: "", user: "dinhhung", role: "Thợ Phay" },
      { name: "Vũ Tiến Thuận", code: "NV00283", oldCode: "NV04", chatId: "", user: "tienthuan", role: "Thợ Tiện" },
      { name: "Nguyễn Mạnh Hà", code: "NV00217", oldCode: "NV05", chatId: "", user: "manhha", role: "Thợ Tiện" },
      { name: "Nguyễn Văn Thanh", code: "NV00216", oldCode: "NV06", chatId: "", user: "vanthanh", role: "Thợ Phay" },
      { name: "Phùng Gia Phúc", code: "NV00267", oldCode: "NV07", chatId: "8852796611", user: "giaphuc", role: "Thợ Cắt Dây" },
      { name: "Trần Văn Dũng", code: "NV00266", oldCode: "NV08", chatId: "8405571371", user: "vandung", role: "Thợ Phay" },
      { name: "Trần Đăng Ninh", code: "NV00220", oldCode: "NV09", chatId: "", user: "dangninh", role: "Thợ Tiện" },
      { name: "Phạm Văn Tráng", code: "NV00215", oldCode: "NV10", chatId: "", user: "vantrang", role: "Thợ Tiện" },
      { name: "Phùng Công Thắng", code: "NV00219", oldCode: "NV11", chatId: "8906721112", user: "congthang", role: "Thợ CNC" },
      { name: "Phạm Văn Sam", code: "NV00265", oldCode: "NV12", chatId: "8836472092", user: "ngocsam", role: "Thợ Hàn/Tiện" },
      { name: "Trần Văn Quỳnh", code: "NV00214", oldCode: "NV13", chatId: "7090612444", user: "vanquynh", role: "Thợ Nguội" },
      { name: "Đinh Văn Nhận", code: "NV00279", oldCode: "NV14", chatId: "8799424202", user: "vannhan", role: "Thợ Bào/Phay" },
      { name: "Đặng Ngọc Long", code: "NV00261", oldCode: "NV15", chatId: "8883746026", user: "ngoclong", role: "Thợ Phay" }
    ];`
);

// Replace KNOWN_WORKERS
content = content.replace(
  /var KNOWN_WORKERS = \[\s*\{ name: "Hoàng Ngọc Hà", code: "NV01"[\s\S]*?\{ name: "Đặng Ngọc Long", code: "NV15"[^\n]*\}\s*\];/,
  `var KNOWN_WORKERS = [
    { name: "Hoàng Ngọc Hà", code: "NV00053", oldCode: "NV01", chatId: "5422717407", user: "Quản Đốc Hoàng Hà" },
    { name: "Nguyễn Trung Đông", code: "NV00218", oldCode: "NV02", chatId: "7154329103", user: "trungdong" },
    { name: "Phùng Gia Phúc", code: "NV00267", oldCode: "NV07", chatId: "8852796611", user: "giaphuc" },
    { name: "Trần Văn Dũng", code: "NV00266", oldCode: "NV08", chatId: "8405571371", user: "vandung" },
    { name: "Phùng Công Thắng", code: "NV00219", oldCode: "NV11", chatId: "8906721112", user: "congthang" },
    { name: "Phạm Văn Sam", code: "NV00265", oldCode: "NV12", chatId: "8836472092", user: "ngocsam" },
    { name: "Trần Văn Quỳnh", code: "NV00214", oldCode: "NV13", chatId: "7090612444", user: "vanquynh" },
    { name: "Đinh Văn Nhận", code: "NV00279", oldCode: "NV14", chatId: "8799424202", user: "vannhan" },
    { name: "Đặng Ngọc Long", code: "NV00261", oldCode: "NV15", chatId: "8883746026", user: "ngoclong" }
  ];`
);

// Update manager exemption check
content = content.replace(
  `if (w.code === "NV01" || w.chatId === "5422717407"`,
  `if (w.code === "NV00053" || w.code === "NV01" || w.chatId === "5422717407"`
);

// Update workerMap matching in dongBoLienKetTelegramTho to support both oldCode & code
content = content.replace(
  `KNOWN_WORKERS.forEach(function (kw) {
    var targetRow = workerMap[kw.code];`,
  `KNOWN_WORKERS.forEach(function (kw) {
    var targetRow = workerMap[kw.code] || workerMap[kw.oldCode];`
);

fs.writeFileSync('google_apps_script.js', content, 'utf8');
console.log('google_apps_script.js updated successfully with new Odoo employee codes!');
