// ==============================================================================
// CẤU HÌNH GOOGLE DRIVE, TELEGRAM BOT & MINI APP
// ==============================================================================
var SPREADSHEET_ID = "";    // Dán ID Google Sheet vào đây nếu dùng Standalone Script (Ví dụ: "1A2b3C4d5E6f7G...")
var PRODUCT_FOLDER_ID = ""; // Ví dụ: "1A2b3C4d5E6f7G..." (Để trống hệ thống tự tạo)
var SCRAP_FOLDER_ID = "";   // Ví dụ: "9Z8y7X6w5V4u3T..." (Để trống hệ thống tự tạo)

// 🤖 CẤU HÌNH TELEGRAM BOT TỰ ĐỘNG CẢNH BÁO
var TELEGRAM_BOT_TOKEN = "8871498341:AAFTzNNaCNXZlaTJlh8znudxrYFs69bu74s"; // Dán Token Bot lấy từ @BotFather vào đây (Ví dụ: "123456789:ABCdefGhIJKlmNo...")
var TELEGRAM_CHAT_ID = "-5457065729";   // Dán Chat ID Nhóm Telegram xưởng vào đây (Ví dụ: "-100123456789")

// 🌐 URL Mini App Sản Lượng của bạn (Netlify hoặc GitHub Pages)
var MINI_APP_URL = "https://happiness2286-dot.github.io/sanluonggcck/";       // Dán link GitHub Pages (ví dụ: "https://ten-ban.github.io/SANLUONG2026/") hoặc Netlify vào đây!

// 🟢 HÀM MỞ GOOGLE SHEET AN TOÀN (HỖ TRỢ CẢ THỦ CÔNG, BỘ HẸN GIỜ TRIGGERS & STANDALONE SCRIPT)
function getSpreadsheet() {
  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (eId) {
      console.log("⚠️ Không mở được qua SPREADSHEET_ID: " + eId.toString());
    }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("❌ Không tìm thấy Bảng tính Google Sheet! Vui lòng mở từ Tiện ích mở rộng -> Apps Script trên Sheet hoặc điền SPREADSHEET_ID ở dòng 4.");
  }
  return ss;
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var masterSheet = ss.getSheetByName("Danh Mục Master");
    if (!masterSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        "result": "empty",
        "message": "Chưa có Master Data trên Cloud"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var cellVal = masterSheet.getRange("A2").getValue();
    if (!cellVal) {
      return ContentService.createTextOutput(JSON.stringify({
        "result": "empty"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var masterData = JSON.parse(cellVal);
    return ContentService.createTextOutput(JSON.stringify({
      "result": "success",
      "masterData": masterData
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      "result": "error",
      "message": err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    // 1. Mở Sheet "Nhật Ký Sản Lượng" (Hoặc Sheet đầu tiên)
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Nhật Ký Sản Lượng");
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }

    // 2. Đọc dữ liệu JSON gửi từ điện thoại công nhân
    var contents = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var data = JSON.parse(contents);

    // XỬ LÝ LƯU DANH MỤC MASTER (SẢN PHẨM, NGUYÊN CÔNG & CÔNG NHÂN) TỪ ADMIN
    if (data.action === "saveMasterData" && data.masterData) {
      var masterSheet = ss.getSheetByName("Danh Mục Master");
      if (!masterSheet) {
        masterSheet = ss.insertSheet("Danh Mục Master");
        masterSheet.appendRow(["CƠ SỞ DỮ LIỆU DANH MỤC MASTER (JSON)"]);
      }
      masterSheet.getRange("A2").setValue(JSON.stringify(data.masterData));

      // Tự động đảm bảo Sheet "Đơn Hàng" & Sheet "Giao Hàng" được khởi tạo chuẩn mẫu
      try { createDonHangGiaoHangSheets(); } catch (eDh) { console.log(eDh); }

      // Đồng bộ tự động danh sách Công Nhân từ Master Data sang Sheet "Danh Sách Công Nhân"
      if (data.masterData.userAccounts && Array.isArray(data.masterData.userAccounts)) {
        var wSheet = ss.getSheetByName("Danh Sách Công Nhân") || ss.insertSheet("Danh Sách Công Nhân");
        var existingNames = new Set();
        var currentData = wSheet.getDataRange().getValues();

        if (currentData.length <= 1) {
          wSheet.clear();
          wSheet.appendRow(["Họ Và Tên Công Nhân", "Tài Khoản / Mã", "Trạng Thái"]);
        } else {
          for (var r = 1; r < currentData.length; r++) {
            if (currentData[r][0]) existingNames.add(String(currentData[r][0]).trim());
          }
        }

        data.masterData.userAccounts.forEach(function (acc) {
          var name = acc.fullName || acc.username;
          if (name && !existingNames.has(name.trim())) {
            wSheet.appendRow([name.trim(), acc.username || "", "Đang làm việc"]);
            existingNames.add(name.trim());
          }
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        "result": "success",
        "message": "Đã đồng bộ thành công Sản phẩm, Nguyên công & Công nhân mới lên Cloud!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // XỬ LÝ LƯU HOẶC CẬP NHẬT ĐƠN HÀNG TỪ ADMIN
    if (data.action === "saveOrderData" && data.order) {
      var sheets = createDonHangGiaoHangSheets();
      var orderSheet = sheets.orderSheet;
      var o = data.order;
      var oPo = String(o.po || "").trim();

      var oRows = orderSheet.getDataRange().getValues();
      var foundRow = -1;

      for (var r = 1; r < oRows.length; r++) {
        if (String(oRows[r][1]).trim().toLowerCase() === oPo.toLowerCase()) {
          foundRow = r + 1;
          break;
        }
      }

      var qtyPlan = Number(o.qty_plan || 0);

      if (foundRow > 1) {
        // Cập nhật dòng PO hiện có
        orderSheet.getRange(foundRow, 3).setValue(o.customer || "");
        orderSheet.getRange(foundRow, 4).setValue(o.product || "");
        orderSheet.getRange(foundRow, 5).setValue(o.product_code || "");
        orderSheet.getRange(foundRow, 6).setValue(qtyPlan);
        orderSheet.getRange(foundRow, 11).setValue(o.order_date || "");
        orderSheet.getRange(foundRow, 12).setValue(o.deadline || "");
        if (o.note) orderSheet.getRange(foundRow, 14).setValue(o.note);
      } else {
        // Thêm PO mới vào dòng cuối
        var nextSttOrder = oRows.length;
        var rIdx = nextSttOrder + 1;
        var formulaGiaCong = "=SUMIFS('Nhật Ký Sản Lượng'!J:J, 'Nhật Ký Sản Lượng'!G:G, B" + rIdx + ")";
        var formulaGiaoHang = "=SUMIFS('Giao Hàng'!F:F, 'Giao Hàng'!C:C, B" + rIdx + ")";
        var formulaConNo = "=F" + rIdx + "-H" + rIdx;
        var formulaTonKho = "=G" + rIdx + "-H" + rIdx;
        var formulaStatus = '=IF(H' + rIdx + '>=F' + rIdx + ', "Đã giao đủ", IF(G' + rIdx + '>=F' + rIdx + ', "Đã sản xuất xong - Chờ giao", IF(G' + rIdx + '>0, "Đang sản xuất", "Chưa sản xuất")))';

        orderSheet.appendRow([
          nextSttOrder,
          oPo,
          o.customer || "",
          o.product || "",
          o.product_code || "",
          qtyPlan,
          formulaGiaCong,
          formulaGiaoHang,
          formulaConNo,
          formulaTonKho,
          o.order_date || "",
          o.deadline || "",
          formulaStatus,
          o.note || ""
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({
        "result": "success",
        "message": "Đã lưu & đồng bộ Đơn hàng lên Google Sheet 'Đơn Hàng'!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // XỬ LÝ LƯU THÔNG TIN GIAO HÀNG TỪ ADMIN / PHÒNG KHO
    if (data.action === "saveDeliveryData" && data.delivery) {
      var sheets = createDonHangGiaoHangSheets();
      var delSheet = sheets.delSheet;
      var d = data.delivery;
      var dRows = delSheet.getDataRange().getValues();
      var nextSttDel = dRows.length;

      delSheet.appendRow([
        nextSttDel,
        d.delivery_date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
        String(d.po || "").trim(),
        d.customer || "",
        d.product || "",
        Number(d.qty_delivered || 0),
        d.unit || "Cái",
        d.vehicle_info || "",
        d.shipper || "",
        d.note || ""
      ]);

      return ContentService.createTextOutput(JSON.stringify({
        "result": "success",
        "message": "Đã ghi nhận phiếu giao hàng lên Google Sheet 'Giao Hàng'!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Tính số thứ tự STT dòng tiếp theo
    var lastRow = sheet.getLastRow();
    var nextStt = lastRow > 1 ? lastRow - 1 : 1;

    // 4. Xử lý TỰ ĐỘNG UPLOAD ÁNH SẢN PHẨM & ÁNH PHẾ PHẨM LÊN GOOGLE DRIVE
    var uploadPhotosToDrive = function (photoArray, folderName, filePrefix, customFolderId) {
      var urls = [];
      if (!photoArray || !Array.isArray(photoArray) || photoArray.length === 0) return urls;
      try {
        var folder;
        if (customFolderId && customFolderId.trim() !== "") {
          try {
            folder = DriveApp.getFolderById(customFolderId.trim());
          } catch (eFolder) {
            console.log("Không tìm thấy Folder ID chỉ định, tự tạo theo tên: " + eFolder.toString());
          }
        }
        if (!folder) {
          var folders = DriveApp.getFoldersByName(folderName);
          folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
        }

        for (var i = 0; i < photoArray.length; i++) {
          var rawPhoto = photoArray[i];
          if (rawPhoto && typeof rawPhoto === 'string') {
            if (rawPhoto.indexOf("data:image") >= 0 || rawPhoto.length > 100) {
              var base64Data = rawPhoto;
              var mimeType = "image/jpeg";

              if (rawPhoto.indexOf("data:image") >= 0) {
                var parts = rawPhoto.split(",");
                var mimeMatch = parts[0].match(/:(.*?);/);
                if (mimeMatch) mimeType = mimeMatch[1];
                base64Data = parts[1] || parts[0];
              }

              var fileName = filePrefix + "_" + (data.worker || "Worker").replace(/\s+/g, "_") + "_" + (data.date || "") + "_STT" + nextStt + "_" + (i + 1) + ".jpg";
              var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
              var file = folder.createFile(blob);

              file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              urls.push(file.getUrl());
            } else if (rawPhoto.indexOf("http") === 0) {
              urls.push(rawPhoto);
            }
          }
        }
      } catch (errDrive) {
        console.log("Lỗi tạo file ảnh trên Google Drive (" + folderName + "): " + errDrive.toString());
      }
      return urls;
    };

    // Upload Ảnh Sản Phẩm Thành Phẩm & Ảnh Phế Phẩm
    var productPhotoUrls = uploadPhotosToDrive(data.product_photos, "Ảnh Báo Cáo Thành Phẩm GCCK 2026", "Anh_SanPham", PRODUCT_FOLDER_ID);
    var scrapPhotoUrls = uploadPhotosToDrive(data.photos, "Ảnh Báo Cáo Phế Phẩm GCCK 2026", "Anh_PhePham", SCRAP_FOLDER_ID);

    var allDriveUrls = [].concat(
      productPhotoUrls.map(function (u) { return "[Sản Phẩm]: " + u; }),
      scrapPhotoUrls.map(function (u) { return "[Phế Phẩm]: " + u; })
    );

    var photoCellContent = allDriveUrls.length > 0 ? allDriveUrls.join("\n") : "Không có ảnh";

    // 5. Thêm 1 dòng báo cáo sản lượng mới vào Google Sheets (Có đính kèm Link Google Drive)
    sheet.appendRow([
      nextStt,                     // STT
      new Date(),                  // Thời gian gửi hệ thống
      data.date || '',             // Ngày làm
      data.worker || '',           // Họ tên công nhân
      data.customer || '',         // Khách hàng
      data.product || '',          // Tên sản phẩm
      data.po || '',               // Số PO
      data.op || '',               // Nguyên công / Công đoạn
      data.machine || '',          // Máy gia công
      data.qty_dat || 0,           // SL Đạt (OK)
      data.qty_xuly || 0,          // SL Xử lý (Rework)
      data.qty_huy || 0,           // SL Hủy (Scrap)
      data.total_wage || 0,        // Lương khoán tạm tính (VNĐ)
      data.material || '',         // Vật tư / Chip dao
      data.qty_material || 0,      // Số lượng tiêu hao
      data.downtime_min || 0,      // Phát sinh dừng máy (Phút)
      data.downtime_note || '',    // Ghi chú phát sinh
      photoCellContent             // Link Google Drive hình ảnh sản phẩm & phế phẩm
    ]);

    // Tự động kiểm tra và thêm PO vào Sheet "Đơn Hàng" nếu chưa có
    if (data.po && String(data.po).trim() !== '') {
      autoSyncSinglePoToOrderSheet(String(data.po).trim(), data.customer || '', data.product || '');
    }

    // 6. Trả về phản hồi XÁC NHẬN THÀNH CÔNG cho Mini App
    return ContentService.createTextOutput(JSON.stringify({
      "result": "success",
      "message": "Đã lưu sản lượng và tải ảnh lên Google Drive thành công!"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      "result": "error",
      "message": err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// 7. HÀM TỰ ĐỘNG ĐỐI SOÁT & CẢNH BÁO QUÁ HẠN BÁO CÁO QUA TELEGRAM BOT
// ==============================================================================

// Chạy tự động sau Ca 1 (Lúc 14h:15)
function checkShift1_14h() {
  checkOverdueReports("Ca 1 (Sáng)");
}

// Chạy tự động sau Ca 2 (Lúc 22h:15)
function checkShift2_22h() {
  checkOverdueReports("Ca 2 (Chiều)");
}

// Chạy tự động sau Ca 3 (Lúc 06h:15 sáng hôm sau)
function checkShift3_06h() {
  checkOverdueReports("Ca 3 (Đêm)");
}

function checkOverdueReports(shiftName) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Nhật Ký Sản Lượng");
    if (!sheet) sheet = ss.getSheets()[0];

    var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    var todayShortStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

    var data = sheet.getDataRange().getValues();
    var reportedWorkers = new Set();

    // Duyệt danh sách các báo cáo đã nộp hôm nay (Cột D là Tên Công Nhân - Index 3)
    for (var i = 1; i < data.length; i++) {
      var rowDate = data[i][2]; // Cột Ngày làm
      var workerName = data[i][3]; // Cột Công nhân

      var isToday = false;
      if (rowDate instanceof Date) {
        var rDateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (rDateStr === todayStr) isToday = true;
      } else if (typeof rowDate === 'string' && (rowDate.includes(todayStr) || rowDate.includes(todayShortStr))) {
        isToday = true;
      }

      if (isToday && workerName) {
        reportedWorkers.add(String(workerName).trim());
      }
    }

    // Danh sách 15 công nhân mặc định từ cơ sở dữ liệu gốc của dự án
    var DEFAULT_WORKERS = [
      "Hoàng Ngọc Hà", "Nguyễn Trung Đông", "Phùng Đình Hùng", "Vũ Tiến Thuận",
      "Nguyễn Mạnh Hà", "Nguyễn Văn Thanh", "Phùng Gia Phúc", "Trần Văn Dũng",
      "Trần Đăng Ninh", "Phạm Văn Tráng", "Phùng Công Thắng", "Phạm Ngọc Sam",
      "Trần Văn Quỳnh", "Đinh Văn Nhận", "Đặng Ngọc Long"
    ];

    // Đọc danh sách Công nhân 100% trực tiếp từ Google Sheet "Danh Sách Công Nhân"
    var allWorkers = [];
    var workerSheet = ss.getSheetByName("Danh Sách Công Nhân") || ss.getSheetByName("CongNhan");

    // Nếu chưa có Sheet "Danh Sách Công Nhân", tự động tạo Sheet chuẩn & điền sẵn 15 công nhân gốc
    if (!workerSheet) {
      workerSheet = ss.insertSheet("Danh Sách Công Nhân");
      workerSheet.appendRow(["Họ Và Tên Công Nhân", "Tài Khoản / Mã", "Trạng Thái"]);
      DEFAULT_WORKERS.forEach(function (wName, idx) {
        workerSheet.appendRow([wName, "NV" + (idx + 1 < 10 ? "0" + (idx + 1) : (idx + 1)), "Đang làm"]);
      });
      console.log("✅ Đã tự động khởi tạo Sheet 'Danh Sách Công Nhân' với 15 công nhân gốc của dự án!");
    }

    // Đọc dữ liệu công nhân từ Sheet "Danh Sách Công Nhân"
    var wData = workerSheet.getDataRange().getValues();
    for (var w = 1; w < wData.length; w++) {
      var name = wData[w][0] ? String(wData[w][0]).trim() : '';
      var status = wData[w][2] ? String(wData[w][2]).trim().toLowerCase() : '';

      // Bỏ qua dòng tiêu đề hoặc công nhân đã đánh dấu "Đã nghỉ" / "Nghỉ việc"
      if (name && name !== "Họ Và Tên Công Nhân" && status !== "nghỉ việc" && status !== "đã nghỉ") {
        allWorkers.push(name);
      }
    }

    // Nếu Sheet vẫn rỗng (do Quản đốc lỡ xóa hết dòng), dùng mặc định 15 công nhân gốc
    if (allWorkers.length === 0) {
      allWorkers = DEFAULT_WORKERS.slice();
      // Tự động điền lại vào Sheet cho Quản đốc
      if (workerSheet.getLastRow() <= 1) {
        DEFAULT_WORKERS.forEach(function (wName, idx) {
          workerSheet.appendRow([wName, "NV" + (idx + 1 < 10 ? "0" + (idx + 1) : (idx + 1)), "Đang làm"]);
        });
      }
    }

    // Lọc công nhân chưa nộp báo cáo
    var missingWorkers = [];
    allWorkers.forEach(function (w) {
      if (!reportedWorkers.has(w)) {
        missingWorkers.push(w);
      }
    });

    if (missingWorkers.length === 0) {
      console.log("✅ Tất cả công nhân đã nộp báo cáo sản lượng đầy đủ cho " + shiftName + "!");
      return;
    }

    // Soạn tin nhắn HTML cảnh báo cho Telegram
    var messageText = "<b>⚠️ CẢNH BÁO QUÁ HẠN BÁO CÁO SẢN LƯỢNG GCCK</b>\n" +
      "--------------------------------------\n" +
      "📌 <b>Kiểm tra:</b> " + shiftName + "\n" +
      "📅 <b>Ngày:</b> " + todayShortStr + "\n" +
      "⏰ <b>Thời điểm:</b> " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm") + "\n" +
      "--------------------------------------\n" +
      "🔴 <b>CÔNG NHÂN CHƯA NỘP BÁO CÁO (" + missingWorkers.length + " người):</b>\n";

    missingWorkers.forEach(function (w, idx) {
      messageText += (idx + 1) + ". <b>" + w + "</b>\n";
    });

    messageText += "--------------------------------------\n";
    if (MINI_APP_URL && MINI_APP_URL.trim() !== "") {
      messageText += "📲 <b>Bấm link bên dưới để nộp báo cáo ngay:</b>\n" + MINI_APP_URL.trim();
    } else {
      messageText += "👉 <i>Đề nghị công nhân truy cập Web App nộp báo cáo bổ sung ngay!</i>";
    }

    console.log(messageText);

    // Gửi cảnh báo qua Telegram Bot API
    sendTelegramMessage(messageText);

  } catch (err) {
    console.log("Lỗi kiểm tra cảnh báo quá hạn: " + err.toString());
  }
}

// 🔑 HÀM KÍCH HOẠT POPUP ỦY QUYỀN GOOGLE CHO TELEGRAM
// (Nếu gặp lỗi "You do not have permission to call UrlFetchApp.fetch", hãy chọn hàm này trên menu và bấm ▶ Chạy 1 lần!)
function authorizeTelegram() {
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN.trim() + "/getMe";
  var response = UrlFetchApp.fetch(url);
  Logger.log("✅ ĐÃ XÁC THỰC QUYỀN TELEGRAM THÀNH CÔNG! Phản hồi Bot: " + response.getContentText());
}

// Hàm gửi tin nhắn Telegram Bot chuẩn API
function sendTelegramMessage(htmlMessageText) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === "" || !TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID.trim() === "") {
    console.log("⚠️ Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID");
    return;
  }

  try {
    var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN.trim() + "/sendMessage";
    var payload = {
      "chat_id": TELEGRAM_CHAT_ID.trim(),
      "text": htmlMessageText,
      "parse_mode": "HTML",
      "disable_web_page_preview": false
    };

    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    var response = UrlFetchApp.fetch(url, options);
    console.log("📲 Đã gửi cảnh báo Telegram thành công! Phản hồi: " + response.getContentText());
  } catch (eTelegram) {
    console.log("❌ Lỗi gửi tin nhắn Telegram: " + eTelegram.toString());
  }
}

// ==============================================================================
// 8. HÀM TỰ ĐỘNG TẠO BỘ HẸN GIỜ (TRIGGERS) CHO 3 CA (14H15, 22H15, 06H15)
// Chạy hàm này 1 lần duy nhất trong Apps Script để kích hoạt đặt lịch!
// ==============================================================================
function setupShiftTriggers() {
  // Xóa các trigger cũ nếu có
  var existingTriggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existingTriggers.length; i++) {
    ScriptApp.deleteTrigger(existingTriggers[i]);
  }

  // Hẹn giờ Ca 1 (Sáng) - Chạy lúc 14:15 hàng ngày
  ScriptApp.newTrigger("checkShift1_14h")
    .timeBased()
    .everyDays(1)
    .atHour(14)
    .nearMinute(15)
    .create();

  // Hẹn giờ Ca 2 (Chiều) - Chạy lúc 22:15 hàng ngày
  ScriptApp.newTrigger("checkShift2_22h")
    .timeBased()
    .everyDays(1)
    .atHour(22)
    .nearMinute(15)
    .create();

  // Hẹn giờ Ca 3 (Đêm) - Chạy lúc 06:15 sáng hàng ngày
  ScriptApp.newTrigger("checkShift3_06h")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(15)
    .create();

  Logger.log("✅ ĐÃ CÀI ĐẶT THÀNH CÔNG BỘ HẸN GIỜ TỰ ĐỘNG CẢNH BÁO CHO 3 CA (14H15, 22H15, 06H15)!");
}

// ==============================================================================
// 9. MENU TỰ ĐỘNG & BỘ TÍNH TOÁN TIẾN ĐỘ SẢN XUẤT TỰ ĐỘNG 100% SẠCH LỖI #ERROR!
// ==============================================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚙️ Quản Lý GCCK 2026")
    .addItem("🚀 XÓA SẠCH LỖI #ERROR! & CẬP NHẬT TIẾN ĐỘ THỰC TẾ", "calculateAndPopulateAllSheets")
    .addItem("📦 Khởi Tạo Bộ 4 Sheet Quản Lý Đơn Hàng & Tiến Độ", "createFullOrderManagementSheets")
    .addItem("🔄 Tự Động Rút PO & Tiến Độ Nguyên Công", "syncAllPosAndOperationsProgress")
    .addItem("⏰ Cài Đặt Bộ Hẹn Giờ Cảnh Báo 3 Ca", "setupShiftTriggers")
    .addToUi();
}

// 🛠️ HÀM TÍNH TOÁN & CẬP NHẬT SỐ LIỆU THỰC TẾ TRỰC TIẾP (XÓA SẠCH 100% LỖI #ERROR!)
function calculateAndPopulateAllSheets() {
  var ss = getSpreadsheet();

  // 1. Đọc dữ liệu Nhật Ký Sản Lượng
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet) {
    var allSheets = ss.getSheets();
    for (var s = 0; s < allSheets.length; s++) {
      var sName = allSheets[s].getName();
      if (sName !== "Tổng Đơn Hàng" && sName !== "Kế Hoạch Sản Xuất" && sName !== "Đơn Hàng Đang Gia Công" && sName !== "Giao Hàng") {
        logSheet = allSheets[s];
        try { logSheet.setName("Nhật Ký Sản Lượng"); } catch (e) {}
        break;
      }
    }
  }

  var poGiaCongMap = {}; // { po: { totalOk: 0, cua: 0, phay: 0, tien: 0, qc: 0 } }

  if (logSheet && logSheet.getLastRow() > 1) {
    var logData = logSheet.getDataRange().getValues();
    for (var i = 1; i < logData.length; i++) {
      var po = logData[i][6] ? String(logData[i][6]).trim() : "";
      var op = logData[i][7] ? String(logData[i][7]).trim().toLowerCase() : "";
      var qtyDat = Number(logData[i][9] || 0);

      if (po) {
        if (!poGiaCongMap[po]) {
          poGiaCongMap[po] = { totalOk: 0, cua: 0, phay: 0, tien: 0, qc: 0 };
        }
        poGiaCongMap[po].totalOk += qtyDat;

        if (op.indexOf("cưa") >= 0 || op.indexOf("cua") >= 0 || op.indexOf("nc1") >= 0) {
          poGiaCongMap[po].cua += qtyDat;
        } else if (op.indexOf("phay") >= 0 || op.indexOf("nc2") >= 0) {
          poGiaCongMap[po].phay += qtyDat;
        } else if (op.indexOf("tiện") >= 0 || op.indexOf("tien") >= 0 || op.indexOf("nc3") >= 0) {
          poGiaCongMap[po].tien += qtyDat;
        } else if (op.indexOf("qc") >= 0 || op.indexOf("mài") >= 0 || op.indexOf("mai") >= 0 || op.indexOf("nc4") >= 0) {
          poGiaCongMap[po].qc += qtyDat;
        }
      }
    }
  }

  // 2. Đọc dữ liệu Giao Hàng
  var delSheet = ss.getSheetByName("Giao Hàng");
  var poGiaoHangMap = {}; // { po: totalDelivered }
  if (delSheet && delSheet.getLastRow() > 1) {
    var delData = delSheet.getDataRange().getValues();
    for (var d = 1; d < delData.length; d++) {
      var dPo = delData[d][2] ? String(delData[d][2]).trim() : "";
      var dQty = Number(delData[d][5] || 0);
      if (dPo) {
        poGiaoHangMap[dPo] = (poGiaoHangMap[dPo] || 0) + dQty;
      }
    }
  }

  // 3. XÓA SẠCH CÔNG THỨC CŨ BỊ LỖI & CẬP NHẬT SHEET "Tổng Đơn Hàng"
  var s1 = ss.getSheetByName("Tổng Đơn Hàng");
  if (s1 && s1.getLastRow() > 1) {
    var lastR1 = s1.getLastRow();
    // 🧹 TẨY SẠCH 100% CÔNG THỨC BỊ DÍNH LỖI CŨ
    s1.getRange(2, 7, lastR1 - 1, 8).clearContent();

    var r1Data = s1.getDataRange().getValues();
    for (var r = 1; r < r1Data.length; r++) {
      var rowNum = r + 1;
      var po1 = r1Data[r][1] ? String(r1Data[r][1]).trim() : "";
      var qtyDatHang = Number(r1Data[r][5] || 0);

      var gcInfo = poGiaCongMap[po1] || { totalOk: 0, cua: 0, phay: 0, tien: 0, qc: 0 };
      var slGiaCong = gcInfo.totalOk;
      var slGiaoHang = poGiaoHangMap[po1] || 0;
      var slConNo = Math.max(0, qtyDatHang - slGiaoHang);
      var slTonKho = Math.max(0, slGiaCong - slGiaoHang);

      var status = "Chưa sản xuất";
      if (slGiaoHang >= qtyDatHang && qtyDatHang > 0) {
        status = "Đã giao đủ";
      } else if (slGiaCong >= qtyDatHang && qtyDatHang > 0) {
        status = "Đã xong - Chờ giao";
      } else if (slGiaCong > 0) {
        status = "Đang sản xuất";
      }

      s1.getRange(rowNum, 7).setValue(slGiaCong);
      s1.getRange(rowNum, 8).setValue(slGiaoHang);
      s1.getRange(rowNum, 9).setValue(slConNo);
      s1.getRange(rowNum, 10).setValue(slTonKho);
      s1.getRange(rowNum, 13).setValue(status);
    }
  }

  // 4. XÓA SẠCH CÔNG THỨC CŨ BỊ LỖI & CẬP NHẬT SHEET "Kế Hoạch Sản Xuất"
  var s2 = ss.getSheetByName("Kế Hoạch Sản Xuất");
  if (s2 && s2.getLastRow() > 1) {
    var lastR2 = s2.getLastRow();
    // 🧹 TẨY SẠCH 100% CÔNG THỨC BỊ DÍNH LỖI CŨ
    s2.getRange(2, 7, lastR2 - 1, 5).clearContent();

    var r2Data = s2.getDataRange().getValues();
    for (var r2 = 1; r2 < r2Data.length; r2++) {
      var rowNum2 = r2 + 1;
      var po2 = r2Data[r2][1] ? String(r2Data[r2][1]).trim() : "";
      var qtyKeHoach = Number(r2Data[r2][5] || 0);

      var gcInfo2 = poGiaCongMap[po2] || { totalOk: 0 };
      var slGiaCong2 = gcInfo2.totalOk;
      var slGiaoHang2 = poGiaoHangMap[po2] || 0;
      var tyLeKH = qtyKeHoach > 0 ? (slGiaCong2 / qtyKeHoach) : 0;
      var statusKH = slGiaCong2 >= qtyKeHoach && qtyKeHoach > 0 ? "Đạt KH" : (slGiaCong2 > 0 ? "Đang làm" : "Chưa làm");

      s2.getRange(rowNum2, 7).setValue(slGiaCong2);
      s2.getRange(rowNum2, 8).setValue(slGiaoHang2);
      s2.getRange(rowNum2, 9).setValue(tyLeKH).setNumberFormat("0.0%");
      s2.getRange(rowNum2, 10).setValue(statusKH);
    }
  }

  // 5. XÓA SẠCH CÔNG THỨC CŨ BỊ LỖI & CẬP NHẬT SHEET "Đơn Hàng Đang Gia Công"
  var s3 = ss.getSheetByName("Đơn Hàng Đang Gia Công");
  if (s3 && s3.getLastRow() > 1) {
    var lastR3 = s3.getLastRow();
    // 🧹 TẨY SẠCH 100% CÔNG THỨC BỊ DÍNH LỖI CŨ
    s3.getRange(2, 6, lastR3 - 1, 10).clearContent();

    var r3Data = s3.getDataRange().getValues();
    for (var r3 = 1; r3 < r3Data.length; r3++) {
      var rowNum3 = r3 + 1;
      var po3 = r3Data[r3][1] ? String(r3Data[r3][1]).trim() : "";
      var qtyDat = Number(r3Data[r3][4] || 0);

      var gcInfo3 = poGiaCongMap[po3] || { totalOk: 0, cua: 0, phay: 0, tien: 0, qc: 0 };

      var slCua = gcInfo3.cua;
      var pctCua = qtyDat > 0 ? (slCua / qtyDat) : 0;

      var slPhay = gcInfo3.phay;
      var pctPhay = qtyDat > 0 ? (slPhay / qtyDat) : 0;

      var slTien = gcInfo3.tien;
      var pctTien = qtyDat > 0 ? (slTien / qtyDat) : 0;

      var slQc = gcInfo3.qc;
      var pctQc = qtyDat > 0 ? (slQc / qtyDat) : 0;

      var pctAvg = (pctCua + pctPhay + pctTien + pctQc) / 4;
      var statusGC = pctAvg >= 1 ? "Hoàn thành 100%" : (gcInfo3.totalOk > 0 ? "Đang gia công" : "Chưa làm");

      s3.getRange(rowNum3, 6).setValue(slCua);
      s3.getRange(rowNum3, 7).setValue(pctCua).setNumberFormat("0.0%");

      s3.getRange(rowNum3, 8).setValue(slPhay);
      s3.getRange(rowNum3, 9).setValue(pctPhay).setNumberFormat("0.0%");

      s3.getRange(rowNum3, 10).setValue(slTien);
      s3.getRange(rowNum3, 11).setValue(pctTien).setNumberFormat("0.0%");

      s3.getRange(rowNum3, 12).setValue(slQc);
      s3.getRange(rowNum3, 13).setValue(pctQc).setNumberFormat("0.0%");

      s3.getRange(rowNum3, 14).setValue(pctAvg).setNumberFormat("0.0%");
      s3.getRange(rowNum3, 15).setValue(statusGC);
    }
  }

  SpreadsheetApp.flush();
  Logger.log("✅ Đã tính toán và cập nhật giá trị thực tế trực tiếp 100% sạch lỗi #ERROR!");
  return "Đã xóa sạch lỗi #ERROR! và cập nhật số liệu thực tế thành công!";
}

// Tên alias hỗ trợ hàm cũ
function fixAllFormulaErrors() {
  return calculateAndPopulateAllSheets();
}

// 1. TỰ ĐỘNG THÊM PO VÀ NGUYÊN CÔNG VÀO CÁC SHEET KHI CÔNG NHÂN BÁO CÁO
function autoSyncSinglePoToOrderSheet(poStr, customerStr, productStr) {
  try {
    if (!poStr || String(poStr).trim() === '') return;
    createFullOrderManagementSheets();
    syncAllPosAndOperationsProgress();
    calculateAndPopulateAllSheets();
  } catch (ePo) {
    console.log("Lỗi tự động đồng bộ PO: " + ePo.toString());
  }
}

// 2. TỰ ĐỘNG QUÉT & ĐỒNG BỘ TIẾN ĐỘ NGUYÊN CÔNG CỦA CÁC PO
function syncAllPosAndOperationsProgress() {
  var ss = getSpreadsheet();
  var tongOrderSheet = ss.getSheetByName("Tổng Đơn Hàng");
  var dangGiaCongSheet = ss.getSheetByName("Đơn Hàng Đang Gia Công");
  var keHoachSheet = ss.getSheetByName("Kế Hoạch Sản Xuất");
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");

  if (!tongOrderSheet || !dangGiaCongSheet || !logSheet) return;

  var existingPos = new Set();
  var tongData = tongOrderSheet.getDataRange().getValues();
  for (var r = 1; r < tongData.length; r++) {
    if (tongData[r][1]) {
      existingPos.add(String(tongData[r][1]).trim().toLowerCase());
    }
  }

  var logData = logSheet.getDataRange().getValues();
  var countAdded = 0;

  for (var i = 1; i < logData.length; i++) {
    var customer = logData[i][4] ? String(logData[i][4]).trim() : "";
    var product = logData[i][5] ? String(logData[i][5]).trim() : "";
    var po = logData[i][6] ? String(logData[i][6]).trim() : "";

    if (po && !existingPos.has(po.toLowerCase())) {
      existingPos.add(po.toLowerCase());
      countAdded++;

      // 2.1 Thêm vào Sheet "Tổng Đơn Hàng"
      var nextSttTong = tongOrderSheet.getLastRow();
      tongOrderSheet.appendRow([
        nextSttTong,
        po,
        customer,
        product,
        "",
        0, 0, 0, 0, 0,
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
        "",
        "Chưa sản xuất",
        "Tự động trích xuất từ Nhật Ký Sản Lượng"
      ]);

      // 2.2 Thêm vào Sheet "Kế Hoạch Sản Xuất"
      if (keHoachSheet) {
        var nextSttKH = keHoachSheet.getLastRow();
        keHoachSheet.appendRow([
          nextSttKH,
          po,
          "Kế hoạch tháng " + (new Date().getMonth() + 1),
          customer,
          product,
          0, 0, 0, 0,
          "Chưa làm",
          "Tự động từ nhật ký"
        ]);
      }

      // 2.3 Thêm vào Sheet "Đơn Hàng Đang Gia Công" (Tiến Độ Nguyên Công %)
      var nextSttGC = dangGiaCongSheet.getLastRow();
      dangGiaCongSheet.appendRow([
        nextSttGC,
        po,
        customer,
        product,
        0,
        0, 0, 0, 0, 0, 0, 0, 0, 0,
        "Chưa làm"
      ]);
    }
  }

  // Tính toán lại giá trị thực tế trực tiếp
  calculateAndPopulateAllSheets();

  Logger.log("✅ Đã tự động quét & rút " + countAdded + " PO cùng tiến độ Nguyên Công!");
}

// 3. KHỞI TẠO BỘ 4 SHEET QUẢN LÝ SẢN XUẤT CHUYÊN NGHIỆP
function createFullOrderManagementSheets() {
  var ss = getSpreadsheet();

  // --------------------------------------------------------------------------
  // SHEET 1: "Tổng Đơn Hàng" (Dữ liệu đầu vào tổng sau khi nhận đơn)
  // --------------------------------------------------------------------------
  var s1Name = "Tổng Đơn Hàng";
  var s1 = ss.getSheetByName(s1Name) || ss.insertSheet(s1Name);
  if (s1.getLastRow() === 0) {
    var h1 = [
      "STT", "Mã PO / Đơn Hàng", "Khách Hàng", "Tên Sản Phẩm", "Mã SP / Mác Thép",
      "SL Đặt Hàng (Tổng)", "SL Đã Gia Công (Tự Động)", "SL Đã Giao Hàng (Tự Động)",
      "SL Còn Thiếu / Nợ Hàng", "SL Tồn Kho Chờ Giao", "Ngày Nhận Đơn",
      "Hạn Giao Hàng (Deadline)", "Trạng Thái Tổng", "Ghi Chú"
    ];
    s1.appendRow(h1);
    s1.getRange(1, 1, 1, h1.length).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff").setHorizontalAlignment("center");
    s1.setRowHeight(1, 35);
    s1.setFrozenRows(1);

    var sample1 = [
      [1, "PO-2026-001", "Win-Win", "Trục Khuỷu Động Cơ Φ250", "TK-250", 1000, 0, 0, 0, 0, "2026-08-01", "2026-08-30", "Chưa sản xuất", "Đơn hàng xuất khẩu"],
      [2, "PO-2026-002", "UCC", "Khuôn gá xích POWER", "KG-POW", 200, 0, 0, 0, 0, "2026-08-05", "2026-08-20", "Chưa sản xuất", "Đơn ưu tiên gia công"]
    ];
    sample1.forEach(function (r) { s1.appendRow(r); });
    for (var c = 1; c <= h1.length; c++) s1.autoResizeColumn(c);
  }

  // --------------------------------------------------------------------------
  // SHEET 2: "Kế Hoạch Sản Xuất" (Kế hoạch tuần / tháng gia công)
  // --------------------------------------------------------------------------
  var s2Name = "Kế Hoạch Sản Xuất";
  var s2 = ss.getSheetByName(s2Name) || ss.insertSheet(s2Name);
  if (s2.getLastRow() === 0) {
    var h2 = [
      "STT", "Mã PO / Đơn Hàng", "Kế Hoạch (Tuần / Tháng)", "Khách Hàng", "Tên Sản Phẩm",
      "SL Kế Hoạch Đặt Ra", "SL Đã Gia Công (Đạt)", "SL Đã Giao Hàng",
      "Tỷ Lệ Hoàn Thành KH (%)", "Trạng Thái Kế Hoạch", "Ghi Chú Tiến Độ"
    ];
    s2.appendRow(h2);
    s2.getRange(1, 1, 1, h2.length).setFontWeight("bold").setBackground("#0369a1").setFontColor("#ffffff").setHorizontalAlignment("center");
    s2.setRowHeight(1, 35);
    s2.setFrozenRows(1);

    var sample2 = [
      [1, "PO-2026-001", "Tuần 34 - Tháng 8", "Win-Win", "Trục Khuỷu Động Cơ Φ250", 500, 0, 0, 0, "Chưa làm", "Kế hoạch Lô 1"],
      [2, "PO-2026-001", "Tuần 35 - Tháng 8", "Win-Win", "Trục Khuỷu Động Cơ Φ250", 500, 0, 0, 0, "Chưa làm", "Kế hoạch Lô 2"]
    ];
    sample2.forEach(function (r) { s2.appendRow(r); });
    for (var c2 = 1; c2 <= h2.length; c2++) s2.autoResizeColumn(c2);
  }

  // --------------------------------------------------------------------------
  // SHEET 3: "Đơn Hàng Đang Gia Công" (TIẾN ĐỘ TỪNG NGUYÊN CÔNG & % HOÀN THÀNH)
  // --------------------------------------------------------------------------
  var s3Name = "Đơn Hàng Đang Gia Công";
  var s3 = ss.getSheetByName(s3Name) || ss.insertSheet(s3Name);
  if (s3.getLastRow() === 0) {
    var h3 = [
      "STT", "Mã PO / Đơn Hàng", "Khách Hàng", "Tên Sản Phẩm", "SL Đặt Hàng",
      "NC1: Cưa Phôi (SL)", "NC1 (%)",
      "NC2: Phay CNC (SL)", "NC2 (%)",
      "NC3: Tiện CNC (SL)", "NC3 (%)",
      "NC4: Mài / QC (SL)", "NC4 (%)",
      "Tiến Độ Tổng Thể (%)", "Trạng Thái Gia Công"
    ];
    s3.appendRow(h3);
    s3.getRange(1, 1, 1, h3.length).setFontWeight("bold").setBackground("#4d7c0f").setFontColor("#ffffff").setHorizontalAlignment("center");
    s3.setRowHeight(1, 35);
    s3.setFrozenRows(1);

    var sample3 = [
      [
        1, "PO-2026-001", "Win-Win", "Trục Khuỷu Động Cơ Φ250", 1000,
        0, 0, 0, 0, 0, 0, 0, 0, 0, "Chưa làm"
      ]
    ];
    sample3.forEach(function (r) { s3.appendRow(r); });
    for (var c3 = 1; c3 <= h3.length; c3++) s3.autoResizeColumn(c3);
  }

  // --------------------------------------------------------------------------
  // SHEET 4: "Giao Hàng" (Nhật ký mỗi lần xuất giao hàng)
  // --------------------------------------------------------------------------
  var s4Name = "Giao Hàng";
  var s4 = ss.getSheetByName(s4Name) || ss.insertSheet(s4Name);
  if (s4.getLastRow() === 0) {
    var h4 = [
      "STT", "Ngày Giao Hàng", "Mã PO / Đơn Hàng", "Khách Hàng", "Tên Sản Phẩm",
      "SL Giao Hàng", "Đơn Vị Tính", "Số Xe / Chứng Từ", "Người Giao", "Ghi Chú"
    ];
    s4.appendRow(h4);
    s4.getRange(1, 1, 1, h4.length).setFontWeight("bold").setBackground("#0f766e").setFontColor("#ffffff").setHorizontalAlignment("center").setVerticalAlignment("middle");
    s4.setRowHeight(1, 35);
    s4.setFrozenRows(1);

    var sample4 = [
      [1, "2026-08-15", "PO-2026-001", "Win-Win", "Trục Khuỷu Động Cơ Φ250", 500, "Cái", "Xe 29C-123.45", "Nguyễn Văn A", "Giao đợt 1 thành công"],
      [2, "2026-08-18", "PO-2026-002", "UCC", "Khuôn gá xích POWER", 200, "Cái", "Xe 30F-987.65", "Trần Văn B", "Giao đủ 100%"]
    ];

    sample4.forEach(function (r) { s4.appendRow(r); });
    for (var c4 = 1; c4 <= h4.length; c4++) s4.autoResizeColumn(c4);
  }

  // Quét PO và tự động tính toán dữ liệu thực tế trực tiếp
  try { syncAllPosAndOperationsProgress(); } catch (eSync) { console.log(eSync); }
  try { calculateAndPopulateAllSheets(); } catch (eFix) { console.log(eFix); }

  Logger.log("✅ Đã khởi tạo thành công trọn bộ 4 Sheet và tính toán số liệu sạch lỗi 100%!");
  return { tongOrderSheet: s1, keHoachSheet: s2, dangGiaCongSheet: s3, delSheet: s4 };
}



