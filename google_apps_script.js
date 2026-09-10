// ==============================================================================
// CẤU HÌNH GOOGLE DRIVE, TELEGRAM BOT & MINI APP
// ==============================================================================
var SPREADSHEET_ID = "1p1xE6AT0ullmXl7R4BQOPxwEPH3wxzGkyPuxdk529h8"; // ID chuẩn xác từ file Google Sheet của bạn (Để trống hệ thống tự tạo)
var PRODUCT_FOLDER_ID = ""; // Ví dụ: "1A2b3C4d5E6f7G..." (Để trống hệ thống tự tạo)
var SCRAP_FOLDER_ID = "";   // Ví dụ: "9Z8y7X6w5V4u3T..." (Để trống hệ thống tự tạo)

// 🤖 CẤU HÌNH TELEGRAM BOT TỰ ĐỘNG CẢNH BÁO
var TELEGRAM_BOT_TOKEN = "8871498341:AAFTzNNaCNXZlaTJlh8znudxrYFs69bu74s";
// Dán Token Bot lấy từ @BotFather vào đây (Ví dụ: "8871498341:AAFTz...")
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

    // Tự động cập nhật tiến độ PO, công suất máy & lương khoán thực tế (100% sạch lỗi)
    try {
      calculateAndPopulateAllSheets();
    } catch (eCalc) {
      console.log("Lỗi cập nhật số liệu tự động: " + eCalc.toString());
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
    if (err.toString().indexOf("UrlFetchApp") !== -1 || err.toString().indexOf("permission") !== -1) {
      throw err; // Ném lỗi ra ngoài để Google Apps Script bắt buộc mở Popup Cấp Quyền (Authorization Required)!
    }
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

  // Gọi UrlFetchApp (Để Google Apps Script tự bật Popup xin cấp quyền khi chạy)
  var response = UrlFetchApp.fetch(url, options);
  console.log("📲 Đã gửi cảnh báo Telegram thành công! Phản hồi: " + response.getContentText());
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
// 9. MENU ĐIỀU HÀNH GCCK 2026 - KHUNG SƯỜN 11 SHEET CHUẨN 100% SẠCH LỖI #ERROR!
// ==============================================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚙️ Quản Lý GCCK 2026")
    .addItem("🚀 KHỞI TẠO BỘ 11 SHEET CHUẨN HÓA (100% SẠCH LỖI #ERROR!)", "setup11ChuanHoaSheets")
    .addItem("🎨 KẺ Ô VIỀN & ĐỊNH DẠNG CHUYÊN NGHIỆP", "formatAllSheetsProfessionally")
    .addItem("🔄 CẬP NHẬT TIẾN ĐỘ & LƯƠNG KHOÁN THỰC TẾ", "calculateAndPopulateAllSheets")
    .addItem("🧹 XÓA 17 SHEET MÁY LẺ CŨ (CHO GỌN BẢNG TÍNH)", "deleteOld17MachineSheets")
    .addItem("⏰ Cài Đặt Bộ Hẹn Giờ Cảnh Báo 3 Ca", "setupShiftTriggers")
    .addToUi();
}

// 🧹 HÀM 1: XÓA 17 SHEET MÁY LẺ CŨ (BẢO TOÀN TUYỆT ĐỐI NHẬT KÝ SẢN LƯỢNG)
function deleteOld17MachineSheets() {
  var ss = getSpreadsheet();
  var sheetsToDelete = [
    "M01_Tien_FUJI", "M02_Tien_OKUMA", "M03_Tien_CNC1", "M04_Tien_CNC2",
    "M05_Tien_T630", "M06_Tien_T1516", "M07_Phay_OKK1", "M08_Phay_OKK2",
    "M09_Phay_OKK3", "M10_Phay_CNC1", "M11_Phay_CNC2", "M12_Phay_OIGO",
    "M13_Phay_YM", "M14_Cua_Bang", "M15_Khoan_Yoshida", "M16_CatDay_DK7745",
    "M17_CatDay_Podatech", "Tổng Đơn Hàng", "Kế Hoạch Sản Xuất", "Đơn Hàng Đang Gia Công", "Giao Hàng"
  ];

  var countDeleted = 0;
  sheetsToDelete.forEach(function(sName) {
    var sh = ss.getSheetByName(sName);
    if (sh && sName !== "Nhật Ký Sản Lượng" && sName !== "Danh Mục Master") {
      try {
        ss.deleteSheet(sh);
        countDeleted++;
      } catch (e) {
        console.log("Bỏ qua sheet " + sName + ": " + e.toString());
      }
    }
  });

  Logger.log("✅ Đã dọn dẹp sạch các sheet máy lẻ cũ!");
  return "Đã xóa các sheet máy lẻ cũ!";
}

// 🚀 HÀM 2: KHỞI TẠO BỘ 11 SHEET CHUẨN HÓA
var STANDARDIZED_SHEETS_DATA = {
  "01_Tong_Quan_Dashboard": [
    [
      "BẢNG ĐIỀU HÀNH TỔNG THỂ & CHỈ SỐ HOẠT ĐỘNG TOÀN DIỆN (EXECUTIVE DASHBOARD)"
    ],
    [
      "Nhà máy Đúc Thép Hợp Kim & Cơ Khí Chính Xác | Giám sát trực quan: Tiến độ PO, Cân bằng tải máy, Điểm nghẽn, Chất lượng & Chi phí"
    ],
    [],
    [
      "",
      "TỔNG LỆNH SX (PO)",
      "",
      "TỔNG BTP ĐÃ XONG",
      "",
      "BTP TỒN CHỜ BÀN GIAO (WIP)",
      "",
      "MÁY NGHẼN QUÁ TẢI (>120%)",
      "",
      "PO ĐỀ XUẤT THUÊ NGOÀI",
      "",
      "TỶ LỆ PHẾ PHẨM (SCRAP RATE)"
    ],
    [],
    [],
    [
      "1. TỔNG HỢP TIẾN ĐỘ & BÀN GIAO THEO ĐỐI TÁC KHÁCH HÀNG"
    ],
    [
      "STT",
      "Khách Hàng",
      "Mặt Hàng Chủ Lực",
      "Số Lượng PO",
      "Tổng SL Đặt",
      "Xong Tại Xưởng",
      "Đã Bàn Giao",
      "Tồn Chờ Bàn Giao",
      "Còn Nợ PO",
      "Tiến Độ Bàn Giao (%)",
      "Trạng Thái Điều Hành",
      "Bộ Phận Tiếp Nhận Tiếp Theo"
    ],
    [
      "1",
      "Thyssen",
      "Sealing strip, below / above (Thép hợp kim chịu mòn)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bộ phận Hoàn thiện (Tẩy bavia/Đóng kiện)"
    ],
    [
      "2",
      "Win-Win",
      "Cánh xoắn đùn ISHIZUE (355Dw900, 318Dw800, 216Dw650...)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bộ phận Hoàn thiện (Lắp cụm trục)"
    ],
    [
      "3",
      "Vico- QLTB",
      "Mẫu thử cơ tính CR, Mẫu kéo nén ASTM",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thử nghiệm ASTM"
    ],
    [
      "4",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái / bên phải)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bộ phận Hoàn thiện"
    ],
    [
      "5",
      "Molycop",
      "Bi đúc hợp kim cắt dây & mài từ",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "PX Nhiệt luyện / Phòng KCS"
    ],
    [
      "6",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145 - Thép Mn13)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "PX Nhiệt luyện (Tôi cao tần)"
    ],
    [
      "7",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền: Thân rô to (φ820x890), Bích rulo",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Tổ Lắp Ráp & Hoàn Thiện"
    ],
    [
      "8",
      "TFG",
      "Nut cover F3P00064, Chi tiết bản vẽ 2CG00820",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bộ phận Hoàn thiện"
    ],
    [
      "9",
      "UCC",
      "Khuôn gá xích POWER, Bạc lót 4-210658-2",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "PX Nhiệt luyện (Tôi chân không)"
    ],
    [
      "TỔNG CỘNG TOÀN NHÀ MÁY",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "-",
      "-"
    ]
  ],
  "02_Canh_Bao_Qua_Tai_SubCon": [
    [
      "HỆ THỐNG CẢNH BÁO ĐƠN HÀNG QUÁ TẢI & ĐỀ XUẤT ĐIỀU CHUYỂN GIA CÔNG NGOÀI (SUB-CON)"
    ],
    [
      "Phân xưởng Cơ khí | Tự động đối soát Tổng giờ công nghệ yêu cầu vs Năng lực máy thực tế -> Cảnh báo Trễ hạn -> Đề xuất chuyển gia công ngoài an toàn"
    ],
    [],
    [
      "STT",
      "Mã PO / LSX",
      "Khách Hàng",
      "Tên Chi Tiết / Quy Cách",
      "SL Cần Làm",
      "Máy Nghẽn Phụ Trách",
      "Tổng Giờ Cần Chạy (h)",
      "Số Ngày Còn Lại (Deadline)",
      "Khả Năng Xưởng Tự Làm (Chi tiết)",
      "SL ĐỀ XUẤT CHUYỂN NGOÀI",
      "Trần Giá Thuê Ngoài / CT (VNĐ)",
      "LỆNH ĐIỀU HÀNH SẢN XUẤT",
      "Đơn Vị Vệ Tinh Đề Xuất",
      "Phương Án Kiểm Soát Rủi Ro"
    ],
    [
      "1",
      "PO-5999",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "50",
      "Máy tiện FUJI",
      "150",
      "5",
      "20",
      "",
      "420000",
      "",
      "Xưởng cơ khí Hoàng Mai",
      "Chuyển NC1 gọt thô ra ngoài, giữ NC3 tiện tinh tại xưởng"
    ],
    [
      "2",
      "PO-3733",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 318Dw800",
      "60",
      "Máy tiện FUJI",
      "150",
      "4",
      "15",
      "",
      "320000",
      "",
      "Công ty Cơ khí Tân Phát",
      "Cung cấp phôi và đồ gá chuẩn, KCS nghiệm thu tại xưởng vệ tinh"
    ],
    [
      "3",
      "PO-7365",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "8",
      "Máy Phay OIGO",
      "80",
      "3",
      "3",
      "",
      "1400000",
      "",
      "Xưởng Phay Giường Đức Long",
      "Gia công ngoài NC1 phay mặt, xưởng giữ lại phay rãnh & tôi cao tần"
    ],
    [
      "4",
      "PO-5313",
      "Thyssen",
      "Sealing trip, below",
      "120",
      "Máy Phay OKK1",
      "100",
      "10",
      "120",
      "",
      "85000",
      "",
      "-",
      "Xưởng đủ năng lực hoàn thành đúng hạn (Nội bộ)"
    ],
    [
      "5",
      "PO-7107",
      "Thyssen",
      "Sealing strip, above",
      "100",
      "Máy Phay OKK3",
      "75",
      "8",
      "100",
      "",
      "95000",
      "",
      "-",
      "Chạy nội bộ 2 ca đảm bảo tiến độ"
    ],
    [
      "6",
      "PO-4545",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "40",
      "Máy Cắt Dây DK7745",
      "100",
      "4",
      "16",
      "",
      "140000",
      "",
      "Cắt dây CNC Nam Định",
      "Gửi file CAD/CAM cắt dây theo dưỡng kiểm"
    ],
    [
      "7",
      "PO-8205",
      "Molycop",
      "Bi 40",
      "80",
      "Máy Cắt Dây DK7745",
      "40",
      "7",
      "80",
      "",
      "65000",
      "",
      "-",
      "Xưởng chạy đêm bù tải, không cần thuê ngoài"
    ],
    [
      "8",
      "PO-1456",
      "UCC",
      "Khuôn gá xích POWER",
      "30",
      "Máy Phay CNC1",
      "60",
      "3",
      "10",
      "",
      "350000",
      "",
      "Cơ khí Chính xác An Phát",
      "Thuê ngoài phay thô, đưa về nhiệt luyện và mài tinh tại xưởng"
    ]
  ],
  "03_Can_Bang_Tai_17_May": [
    [
      "BẢNG PHÂN TÍCH CÂN BẰNG TẢI THIẾT BỊ & NĂNG LỰC SẢN XUẤT XƯỞNG"
    ],
    [
      "Nhà máy Cơ khí | Theo dõi Năng lực khả dụng (h/tuần) vs Nhu cầu giờ công nghệ (h/tuần) -> Phát hiện điểm nghẽn (Bottleneck)"
    ],
    [
      "STT",
      "Tên Thiết Bị / Máy Gia Công",
      "Nhóm Công Nghệ",
      "Số Ca Làm Việc / Ngày",
      "Năng Lực Khả Dụng (Giờ/Tuần)",
      "Nhu Cầu Giờ Cần Chạy (Giờ)",
      "Hệ Số Tải Máy (%)",
      "Đánh Giá Trạng Thái Tải",
      "Số Giờ Bị Thiếu Hụt (h)",
      "Máy Thay Thế Dự Phòng (San Tải)",
      "Khả Năng Chuyển Máy Nội Bộ (%)",
      "Đề Xuất Hành Động Quản Đốc",
      "Ghi Chú Kỹ Thuật"
    ],
    [
      "1",
      "Máy tiện FUJI",
      "Tiện CNC hạng vừa",
      "2",
      "96",
      "158",
      "",
      "",
      "",
      "Máy tiện OKUMA / CNC1",
      "0.4",
      "San bớt 40% sang OKUMA, còn lại 60h chuyển thuê ngoài"
    ],
    [
      "2",
      "Máy Phay OKK3",
      "Phay CNC 3 trục",
      "2",
      "96",
      "122",
      "",
      "",
      "",
      "Máy Phay OKK1 / OKK2",
      "0.5",
      "San bớt chi tiết phay mặt sang OKK1, OKK2"
    ],
    [
      "3",
      "Máy Phay OIGO",
      "Phay giường hạng nặng",
      "2",
      "96",
      "145",
      "",
      "",
      "",
      "Không có máy nội bộ tương đương",
      "0",
      "BẮT BUỘC thuê ngoài NC1 phay thô hoặc chạy ca 3"
    ],
    [
      "4",
      "Máy Cắt Dây DK7745",
      "Cắt dây CNC",
      "2.5",
      "120",
      "140",
      "",
      "",
      "",
      "Máy Cắt Dây DK7780 / Podatech",
      "0.5",
      "Chuyển việc sang DK7780 và vệ tinh cắt dây Nam Định"
    ],
    [
      "5",
      "Máy tiện OKUMA",
      "Tiện CNC chính xác",
      "2",
      "96",
      "82",
      "",
      "",
      "",
      "Sẵn sàng nhận tải bù từ FUJI",
      "1",
      "Đang tải tối ưu (85%), sẵn sàng nhận bù việc"
    ],
    [
      "6",
      "Máy Phay OKK1",
      "Phay CNC",
      "2",
      "96",
      "88",
      "",
      "",
      "",
      "Sẵn sàng nhận việc từ OKK3",
      "1",
      "Tải tối ưu (92%)"
    ],
    [
      "7",
      "Máy Phay OKK2",
      "Phay CNC",
      "2",
      "96",
      "75",
      "",
      "",
      "",
      "Sẵn sàng nhận việc từ OKK3",
      "1",
      "Tải 78%, còn dư năng lực"
    ],
    [
      "8",
      "Máy Phay CNC1",
      "Phay CNC",
      "2",
      "96",
      "70",
      "",
      "",
      "",
      "Sẵn sàng san tải",
      "1",
      "Tải 73%"
    ],
    [
      "9",
      "Máy Phay CNC2",
      "Phay CNC",
      "2",
      "96",
      "68",
      "",
      "",
      "",
      "Sẵn sàng san tải",
      "1",
      "Tải 71%"
    ],
    [
      "10",
      "Máy Cắt Dây DK7780",
      "Cắt dây CNC khổ lớn",
      "2",
      "96",
      "65",
      "",
      "",
      "",
      "Nhận việc từ DK7745",
      "1",
      "Tải 68%"
    ],
    [
      "11",
      "Máy Cắt Dây Podatech",
      "Cắt dây CNC",
      "2",
      "96",
      "55",
      "",
      "",
      "",
      "Nhận việc từ DK7745",
      "1",
      "Tải 57%"
    ],
    [
      "12",
      "Máy Khoan cần Yoshida",
      "Khoan / Taro",
      "2",
      "96",
      "92",
      "",
      "",
      "",
      "Gia công nội bộ ổn định",
      "1",
      "Tải 96% - Bình thường"
    ],
    [
      "13",
      "Máy tiện Tiện T1516",
      "Tiện đứng hạng nặng",
      "2",
      "96",
      "85",
      "",
      "",
      "",
      "Chạy thân rô to & bích",
      "1",
      "Tải 89%"
    ],
    [
      "14",
      "Máy tiện Tiện T1517",
      "Tiện đứng hạng nặng",
      "2",
      "96",
      "70",
      "",
      "",
      "",
      "Chạy rô to",
      "1",
      "Tải 73%"
    ],
    [
      "15",
      "Máy tiện Tiện T1522",
      "Tiện đứng hạng nặng",
      "2",
      "96",
      "45",
      "",
      "",
      "",
      "Phay mặt rô to",
      "1",
      "Tải 47%"
    ],
    [
      "16",
      "Máy tiện CNC1",
      "Tiện CNC",
      "2",
      "96",
      "50",
      "",
      "",
      "",
      "Nhận tải từ FUJI",
      "1",
      "Tải 52%"
    ],
    [
      "17",
      "Máy tiện T630",
      "Tiện vạn năng",
      "1",
      "48",
      "25",
      "",
      "",
      "",
      "Hỗ trợ sửa khuôn/gá",
      "1",
      "Tải 52%"
    ]
  ],
  "04_Bao_Gia_Gia_Thanh_SP": [
    [
      "BẢNG TÍNH THÀNH PHẨM, TỔNG HỢP GIÁ THÀNH GIA CÔNG & BÁO GIÁ SẢN PHẨM"
    ],
    [
      "Nhà máy Đúc Thép Hợp Kim & Cơ Khí Chính Xác | Cơ cấu giá: Phôi đúc + Khoán thợ + Dao cụ tiêu hao + Giờ máy + Chi phí quản lý chung + Lợi nhuận kỳ vọng"
    ],
    [
      "STT",
      "Khách Hàng",
      "Tên / Quy Cách Sản Phẩm Đúc",
      "Mác Thép Hợp Kim",
      "Khối Lượng Phôi (kg)",
      "Đơn Giá Thép Đúc (VNĐ/kg)",
      "Tiền Phôi Đúc (VNĐ)",
      "Tổng Tiền Khoán Thợ (VNĐ)",
      "Tổng Chi Phí Dao Cụ (VNĐ)",
      "Tổng Chi Phí Giờ Máy (VNĐ)",
      "GIÁ THÀNH SẢN XUẤT (VNĐ)",
      "Chi Phí QL & Nhiệt Luyện (15%)",
      "GIÁ THÀNH TOÀN BỘ (VNĐ)",
      "Lợi Nhuận Kỳ Vọng (18%)",
      "ĐƠN GIÁ BÁO GIÁ CHÀO KHÁCH (VNĐ)",
      "Ghi Chú Đơn Hàng"
    ],
    [
      "1",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "Thép Mangan Mn13",
      "1250",
      "48000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Hàng chịu mài mòn va đập mạnh"
    ],
    [
      "2",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "Thép hợp kim 35CrMo",
      "3600",
      "52000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Rô to nghiền sơ cấp nặng"
    ],
    [
      "3",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "Thép đúc ZG35",
      "180",
      "42000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bích đỡ rulo"
    ],
    [
      "4",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "Thép đúc chịu mòn Cr-Ni",
      "280",
      "55000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Vít đùn công nghiệp"
    ],
    [
      "5",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 114Dw300",
      "Thép đúc hợp kim Cr",
      "65",
      "52000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Vít đùn cỡ nhỏ"
    ],
    [
      "6",
      "Thyssen",
      "Sealing strip, below",
      "Thép hợp kim chống mòn",
      "45",
      "62000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Thanh làm kín xỉ"
    ],
    [
      "7",
      "Thyssen",
      "Sealing strip, above",
      "Thép hợp kim chống mòn",
      "48",
      "62000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Thanh làm kín trên"
    ],
    [
      "8",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "Thép đúc va đập cao",
      "120",
      "50000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Ốp đầu dao nhào"
    ],
    [
      "9",
      "UCC",
      "Khuôn gá xích POWER",
      "Thép hợp kim Cr12MoV",
      "85",
      "75000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Khuôn dập xích"
    ],
    [
      "10",
      "Vico- QLTB",
      "Mẫu Thử CR & hàng #",
      "Thép đúc mẫu ASTM",
      "15",
      "60000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Mẫu kiểm định cơ tính"
    ]
  ],
  "05_Dinh_Muc_Khoan_Routing": [
    [
      "BẢNG ĐỊNH MỨC CÔNG NGHỆ, MỨC KHOÁN THEO TỪNG NGUYÊN CÔNG & TIÊU HAO DAO CỤ"
    ],
    [
      "Phân xưởng Cơ khí | Bấm giờ định mức (phút/giờ) - Chọn máy phù hợp - Định mức dao cụ (lưỡi cắt) - Mức khoán công nhân (VNĐ/chi tiết)"
    ],
    [
      "STT",
      "Khách Hàng",
      "Tên Sản Phẩm Đúc",
      "Thứ Tự NC",
      "Nội Dung Nguyên Công Gia Công",
      "Máy Gia Công Chỉ Định",
      "Định Mức Giờ (h)",
      "Định Mức Phút (p)",
      "Chủng Loại Dụng Cụ Cắt",
      "Số Lưỡi Cắt / Mảnh",
      "Tuổi Thọ (Chi Tiết / Lưỡi)",
      "Đơn Giá Mảnh Dao (VNĐ)",
      "Chi Phí Dao / Chi Tiết (VNĐ)",
      "MỨC KHOÁN THỢ (VNĐ/CT)",
      "Đơn Giá Giờ Máy (VNĐ/h)",
      "Chi Phí Máy / Chi Tiết (VNĐ)",
      "TỔNG CHI PHÍ NGUYÊN CÔNG (VNĐ)"
    ],
    [
      "1",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "NC1",
      "G/c phay thô phá vỏ đúc & bán tinh mặt phẳng Kt 445/145mm",
      "Máy Phay OIGO",
      "",
      "360",
      "Đài phay chíp tròn R6 phủ CVD va đập",
      "4",
      "0.5",
      "180000",
      "",
      "1562400",
      "280000"
    ],
    [
      "2",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "NC2",
      "G/c phay hoàn thiện rãnh 62/52mm & bo mép R",
      "Máy Phay OIGO",
      "",
      "240",
      "Dao phay gắn mảnh CBN chịu nhiệt",
      "2",
      "0.25",
      "450000",
      "",
      "892800",
      "280000"
    ],
    [
      "3",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC1",
      "G/c tiện khỏa mặt đầu L=690mm (Mặt 1 & 2)",
      "Máy tiện Tiện T1516",
      "",
      "180",
      "Dao tiện thô WNMG 080408 cán vuông 32",
      "6",
      "1",
      "120000",
      "",
      "350000",
      "320000"
    ],
    [
      "4",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC2",
      "G/c tiện thô & bán tinh ngoài Ø820 / Ø690mm",
      "Máy tiện Tiện T1517",
      "",
      "860",
      "Chíp CNMG 160612 mác đúc hợp kim",
      "4",
      "0.5",
      "160000",
      "",
      "1800000",
      "320000"
    ],
    [
      "5",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC3",
      "G/c tiện tinh Ø570/220mm, bo cung R20",
      "Máy tiện Tiện T1516",
      "",
      "240",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "",
      "500000",
      "320000"
    ],
    [
      "6",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC4",
      "G/c tiện tinh trục Ø220 (+0.1/-0)mm",
      "Máy tiện Tiện T1516",
      "",
      "60",
      "Chíp tiện tinh TNMG 160404 giảm chấn",
      "6",
      "2",
      "110000",
      "",
      "150000",
      "320000"
    ],
    [
      "7",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC5",
      "G/c tiện đầu đối diện Ø570/220mm đảo đầu",
      "Máy tiện Tiện T1516",
      "",
      "240",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "",
      "500000",
      "320000"
    ],
    [
      "8",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC6",
      "G/c tiện trục đối diện Ø220 (+0.1/-0) đảo đầu",
      "Máy tiện Tiện T1516",
      "",
      "60",
      "Chíp tiện tinh TNMG 160404 giảm chấn",
      "6",
      "2",
      "110000",
      "",
      "150000",
      "320000"
    ],
    [
      "9",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC7",
      "G/c phay mp hoàn thiện 8 mặt x (690x80mm)",
      "Máy tiện Tiện T1522",
      "",
      "225",
      "Đài phay mặt chíp APMT 1604 PDER",
      "2",
      "0.5",
      "95000",
      "",
      "450000",
      "320000"
    ],
    [
      "10",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC8",
      "G/c khoan 40 lỗ x Ø22mm",
      "Máy Khoan cần Yoshida",
      "",
      "450",
      "Mũi khoan hợp kim gắn mảnh Ø22",
      "2",
      "2",
      "650000",
      "",
      "650000",
      "130000"
    ],
    [
      "11",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC9",
      "G/c khoan & taro 12 lỗ ren M16 x 2.0",
      "Máy Khoan cần Yoshida",
      "",
      "450",
      "Mũi taro rãnh xoắn hợp kim M16",
      "1",
      "5",
      "450000",
      "",
      "650000",
      "130000"
    ],
    [
      "12",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC1",
      "G/c tiện hoàn thiện ngoài Ø500/250mm",
      "Máy tiện FUJI",
      "",
      "225",
      "Dao tiện WNMG 080408",
      "6",
      "1",
      "120000",
      "",
      "250000",
      "220000"
    ],
    [
      "13",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC2",
      "G/c tiện móc lỗ côn 9° Ø160/Ø220mm",
      "Máy tiện FUJI",
      "",
      "225",
      "Dao tiện lỗ trong TNMG 160408",
      "6",
      "1",
      "110000",
      "",
      "250000",
      "220000"
    ],
    [
      "14",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC3",
      "G/c khoan 12-Ø17 / Ø25mm",
      "Máy Khoan cần Yoshida",
      "",
      "120",
      "Mũi khoan xoắn hợp kim Ø17/Ø25",
      "2",
      "4",
      "320000",
      "",
      "180000",
      "130000"
    ],
    [
      "15",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC4",
      "G/c cắt dây cavet DK7745 rãnh 32mm",
      "Máy Cắt Dây DK7745",
      "",
      "150",
      "Dây cắt Molypden 0.18mm",
      "1",
      "10",
      "120000",
      "",
      "150000",
      "110000"
    ],
    [
      "16",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC1",
      "G/c tiện thô & bán tinh biên dạng cánh xoắn đúc",
      "Máy tiện FUJI",
      "",
      "180",
      "Chíp R5 THREADEX - P3200",
      "2",
      "0.5",
      "220000",
      "",
      "450000",
      "220000"
    ],
    [
      "17",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC2",
      "G/c phay rãnh then cavet truyền động",
      "Máy Phay OKK3",
      "",
      "90",
      "Dao phay ngón Solid Carbide Ø20",
      "4",
      "3",
      "320000",
      "",
      "250000",
      "250000"
    ],
    [
      "18",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC3",
      "G/c tiện tinh hoàn thiện cánh xoắn & vát mép",
      "Máy tiện FUJI",
      "",
      "120",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "",
      "350000",
      "220000"
    ],
    [
      "19",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 114Dw300",
      "NC1",
      "G/c tiện hoàn thiện toàn bộ biên dạng cánh",
      "Máy tiện OKUMA",
      "",
      "45",
      "Chíp R5 THREADEX - P3200",
      "2",
      "2",
      "220000",
      "",
      "83700",
      "220000"
    ],
    [
      "20",
      "Thyssen",
      "Sealing strip, below",
      "NC1",
      "G/c phay mặt phẳng NC1 kích thước 47mm",
      "Máy Phay OKK3",
      "",
      "45",
      "Chíp Pramet 6 cạnh (HNGX 0906)",
      "6",
      "3",
      "140000",
      "",
      "37200",
      "250000"
    ],
    [
      "21",
      "Thyssen",
      "Sealing strip, below",
      "NC2",
      "G/c phay mặt phẳng NC2 kích thước 95mm",
      "Máy Phay OKK1",
      "",
      "50",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "2",
      "95000",
      "",
      "37200",
      "250000"
    ],
    [
      "22",
      "Thyssen",
      "Sealing strip, below",
      "NC3",
      "G/c phay cạnh NC3 kích thước 12mm",
      "Máy Phay OKK1",
      "",
      "35",
      "Dao phay ngón Solid Carbide Ø12",
      "4",
      "8",
      "380000",
      "",
      "45000",
      "250000"
    ],
    [
      "23",
      "Thyssen",
      "Sealing strip, below",
      "NC4",
      "G/c khoan lỗ phi 14 / 2 lỗ",
      "Máy Khoan cần Yoshida",
      "",
      "20",
      "Mũi khoan hợp kim Ø14",
      "2",
      "10",
      "280000",
      "",
      "26148",
      "130000"
    ],
    [
      "24",
      "Thyssen",
      "Sealing strip, above",
      "NC1",
      "G/c phay mặt phẳng NC1 kích thước 95mm",
      "Máy Phay OKK3",
      "",
      "45",
      "Chíp Pramet 6 cạnh (HNGX 0906)",
      "6",
      "3",
      "140000",
      "",
      "37200",
      "250000"
    ],
    [
      "25",
      "Thyssen",
      "Sealing strip, above",
      "NC2",
      "G/c phay mặt phẳng NC2 kích thước 412mm",
      "Máy Phay OKK2",
      "",
      "60",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "1.5",
      "95000",
      "",
      "45000",
      "250000"
    ],
    [
      "26",
      "Thyssen",
      "Sealing strip, above",
      "NC3",
      "G/c phay mặt phẳng NC3 kích thước 412mm còn lại",
      "Máy Phay OKK2",
      "",
      "60",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "1.5",
      "95000",
      "",
      "45000",
      "250000"
    ],
    [
      "27",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "NC1",
      "G/c cắt dây định hình biên dạng đúc",
      "Máy Cắt Dây DK7745",
      "",
      "150",
      "Dây cắt Molypden 0.18mm",
      "1",
      "5",
      "120000",
      "",
      "148800",
      "110000"
    ],
    [
      "28",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "NC2",
      "G/c khoan & taro ren M14",
      "Máy Khoan cần Yoshida",
      "",
      "45",
      "Mũi taro rãnh xoắn M14",
      "1",
      "8",
      "320000",
      "",
      "63767",
      "130000"
    ],
    [
      "29",
      "UCC",
      "Khuôn gá xích POWER",
      "NC1",
      "G/c phay phá thô hốc khuôn gá",
      "Máy Phay CNC1",
      "",
      "120",
      "Đài phay gắn mảnh APMT 1604",
      "2",
      "1",
      "95000",
      "",
      "150000",
      "220000"
    ],
    [
      "30",
      "UCC",
      "Khuôn gá xích POWER",
      "NC2",
      "G/c phay tinh biên dạng sau tôi",
      "Máy Phay CNC2",
      "",
      "150",
      "Mảnh phay CBN gia công thép tôi",
      "2",
      "0.5",
      "450000",
      "",
      "250000",
      "220000"
    ],
    [
      "31",
      "Vico- QLTB",
      "Mẫu Thử CR & hàng #",
      "NC1",
      "G/c tiện hoàn thiện mẫu thử ASTM",
      "Máy tiện FUJI",
      "",
      "40",
      "Dao tiện tinh TNMG 160404",
      "6",
      "5",
      "110000",
      "",
      "79483",
      "220000"
    ]
  ],
  "06_Ke_Hoach_Tien_Do_PO": [
    [
      "KẾ HOẠCH TIẾN ĐỘ SẢN XUẤT & ĐIỀU ĐỘ ĐƠN HÀNG (PO/LSX) THEO KHÁCH HÀNG"
    ],
    [
      "Phân xưởng Gia công Cơ khí | Tự động cân đối: Kế hoạch giao hàng - BTP xong tại xưởng - Đã bàn giao chuyển khâu - Tồn chờ bàn giao"
    ],
    [
      "STT",
      "Mã Lệnh SX / PO",
      "Khách Hàng",
      "Tên / Quy Cách Chi Tiết Đúc",
      "SL Kế Hoạch (Chi tiết)",
      "BTP Xong Tại Xưởng",
      "Đã Bàn Giao Đi",
      "Tồn Chờ Bàn Giao (WIP)",
      "Còn Nợ Kế Hoạch",
      "Khâu Chuyển Tiếp Theo",
      "Ngày Bắt Đầu",
      "Hạn Giao BTP",
      "Tiến Độ Bàn Giao (%)",
      "Trạng Thái Điều Độ"
    ],
    [
      "1",
      "PO-2026-001",
      "Win-Win",
      "Trục Khuỷu Động Cơ Φ250",
      "1000",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-01",
      "2026-08-30"
    ],
    [
      "2",
      "PO-2026-002",
      "UCC",
      "Khuôn gá xích POWER",
      "200",
      "",
      "",
      "",
      "",
      "PX Nhiệt Luyện (Tôi chân không)",
      "2026-08-05",
      "2026-08-20"
    ],
    [
      "3",
      "PO-2026-003",
      "Vico- QLTB",
      "Mẫu Thử CR & hàng #",
      "500",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thử Nghiệm ASTM",
      "2026-08-10",
      "2026-08-25"
    ],
    [
      "4",
      "PO-1602",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "",
      "",
      "",
      "",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-30",
      "2026-09-06"
    ],
    [
      "5",
      "PO-3429",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "",
      "",
      "",
      "",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-31",
      "2026-09-07"
    ],
    [
      "6",
      "PO-5670",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "",
      "",
      "",
      "",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-31",
      "2026-09-07"
    ],
    [
      "7",
      "PO-6829",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "",
      "",
      "",
      "",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-09-01",
      "2026-09-08"
    ],
    [
      "8",
      "PO-7044",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "",
      "",
      "",
      "",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-30",
      "2026-09-06"
    ],
    [
      "9",
      "PO-7189",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "",
      "",
      "",
      "",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-30",
      "2026-09-06"
    ],
    [
      "10",
      "PO-7365",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "",
      "",
      "",
      "",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-29",
      "2026-09-05"
    ],
    [
      "11",
      "PO-1279",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "15",
      "",
      "",
      "",
      "",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-09-01",
      "2026-09-08"
    ],
    [
      "12",
      "PO-2504",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "2",
      "",
      "",
      "",
      "",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-08-21",
      "2026-08-28"
    ],
    [
      "13",
      "PO-4603",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "1",
      "",
      "",
      "",
      "",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-08-17",
      "2026-08-24"
    ],
    [
      "14",
      "PO-5612",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "1",
      "",
      "",
      "",
      "",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-08-17",
      "2026-08-24"
    ],
    [
      "15",
      "PO-7487",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "3",
      "",
      "",
      "",
      "",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-08-19",
      "2026-08-26"
    ],
    [
      "16",
      "PO-8134",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "15",
      "",
      "",
      "",
      "",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-09-01",
      "2026-09-08"
    ],
    [
      "17",
      "PO-1537",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-17",
      "2026-08-24"
    ],
    [
      "18",
      "PO-2080",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "2",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-31",
      "2026-09-07"
    ],
    [
      "19",
      "PO-2227",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19",
      "2026-08-26"
    ],
    [
      "20",
      "PO-2285",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-09-01",
      "2026-09-08"
    ],
    [
      "21",
      "PO-3079",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "40",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-21",
      "2026-08-28"
    ],
    [
      "22",
      "PO-3081",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-18",
      "2026-08-25"
    ],
    [
      "23",
      "PO-3455",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-31",
      "2026-09-07"
    ],
    [
      "24",
      "PO-3528",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-16",
      "2026-08-23"
    ],
    [
      "25",
      "PO-4481",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-16",
      "2026-08-23"
    ],
    [
      "26",
      "PO-4525",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "15",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19",
      "2026-08-26"
    ],
    [
      "27",
      "PO-4545",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "2",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-14",
      "2026-08-21"
    ],
    [
      "28",
      "PO-5710",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-20",
      "2026-08-27"
    ],
    [
      "29",
      "PO-6183",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19",
      "2026-08-26"
    ],
    [
      "30",
      "PO-7253",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "17",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-20",
      "2026-08-27"
    ],
    [
      "31",
      "PO-7319",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "2",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-15",
      "2026-08-22"
    ],
    [
      "32",
      "PO-7432",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "8",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-22",
      "2026-08-29"
    ],
    [
      "33",
      "PO-9119",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19",
      "2026-08-26"
    ],
    [
      "34",
      "PO-2891",
      "Molycop",
      "Bi 25",
      "10",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-29",
      "2026-09-05"
    ],
    [
      "35",
      "PO-4099",
      "Molycop",
      "Bi 40",
      "30",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-23",
      "2026-08-30"
    ],
    [
      "36",
      "PO-4474",
      "Molycop",
      "Bi 25",
      "3",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-20",
      "2026-08-27"
    ],
    [
      "37",
      "PO-5163",
      "Molycop",
      "Bi 40",
      "19",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-29",
      "2026-09-05"
    ],
    [
      "38",
      "PO-5200",
      "Molycop",
      "Bi 25",
      "19",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-17",
      "2026-08-24"
    ],
    [
      "39",
      "PO-7435",
      "Molycop",
      "Bi 90",
      "3",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-14",
      "2026-08-21"
    ],
    [
      "40",
      "PO-8205",
      "Molycop",
      "Bi 40",
      "7",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-14",
      "2026-08-21"
    ],
    [
      "41",
      "PO-8823",
      "Molycop",
      "Bi 40",
      "21",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-20",
      "2026-08-27"
    ],
    [
      "42",
      "PO-9933",
      "Molycop",
      "Bi 40",
      "5",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-17",
      "2026-08-24"
    ],
    [
      "43",
      "PO-1243",
      "TFG",
      "Taytona Drawing No 2CG00820",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-09-01",
      "2026-09-08"
    ],
    [
      "44",
      "PO-1400",
      "TFG",
      "Taytona Drawing No 2CG00820",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-31",
      "2026-09-07"
    ],
    [
      "45",
      "PO-1877",
      "TFG",
      "Pattern Drawing No 2CG00820",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-30",
      "2026-09-06"
    ],
    [
      "46",
      "PO-3223",
      "TFG",
      "Nut cover số hiệu F3P00064-2 theo bản vẽ 2CG01074",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-18",
      "2026-08-25"
    ],
    [
      "47",
      "PO-8916",
      "TFG",
      "Pattern Drawing No 2CG00820",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-29",
      "2026-09-05"
    ],
    [
      "48",
      "PO-9407",
      "TFG",
      "Nut cover số hiệu E4P08508 theo bản vẽ 2CG00744",
      "1",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-23",
      "2026-08-30"
    ],
    [
      "49",
      "PO-1050",
      "Thyssen",
      "Sealing trip, below",
      "6",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-15",
      "2026-08-22"
    ],
    [
      "50",
      "PO-1091",
      "Thyssen",
      "Sealing strip, above",
      "9",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-27",
      "2026-09-03"
    ],
    [
      "51",
      "PO-1099",
      "Thyssen",
      "Sealing strip, above",
      "15",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-31",
      "2026-09-07"
    ],
    [
      "52",
      "PO-1112",
      "Thyssen",
      "Sealing strip, below",
      "14",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-18",
      "2026-08-25"
    ],
    [
      "53",
      "PO-1168",
      "Thyssen",
      "Sealing strip, above",
      "8",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-28",
      "2026-09-04"
    ],
    [
      "54",
      "PO-1193",
      "Thyssen",
      "Sealing trip, below",
      "13",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-15",
      "2026-08-22"
    ],
    [
      "55",
      "PO-1415",
      "Thyssen",
      "Sealing strip, above",
      "2",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-29",
      "2026-09-05"
    ],
    [
      "56",
      "PO-1464",
      "Thyssen",
      "Sealing trip, below",
      "29",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-16",
      "2026-08-23"
    ],
    [
      "57",
      "PO-1494",
      "Thyssen",
      "Sealing trip, below",
      "8",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-14",
      "2026-08-21"
    ],
    [
      "58",
      "PO-1502",
      "Thyssen",
      "Sealing trip, below",
      "5",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19",
      "2026-08-26"
    ],
    [
      "59",
      "PO-1545",
      "Thyssen",
      "Sealing strip, below",
      "26",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19",
      "2026-08-26"
    ],
    [
      "60",
      "PO-1592",
      "Thyssen",
      "Sealing strip, below",
      "16",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-09-02",
      "2026-09-09"
    ],
    [
      "61",
      "PO-1695",
      "Thyssen",
      "Sealing trip, below",
      "10",
      "",
      "",
      "",
      "",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-15",
      "2026-08-22"
    ]
  ],
  "08_Kiem_Soat_Chat_Luong_QA": [
    [
      "HỆ THỐNG KIỂM SOÁT CHẤT LƯỢNG TOÀN DIỆN (QA/QC) & PHÂN TÍCH NGUYÊN NHÂN PHẾ PHẨM"
    ],
    [
      "Phân xưởng Gia công Cơ khí | Tách bạch nguyên nhân: Lỗi Khâu Đúc (Rỗ xỉ/Nứt/Co ngót) vs Lỗi Gia Công (Lẹm kích thước/Cháy dao/Gá lệch) để tính công bằng chi phí"
    ],
    [
      "STT",
      "Ngày Phát Hiện",
      "Mã PO / LSX",
      "Khách Hàng",
      "Tên Chi Tiết / Quy Cách",
      "Nguyên Công Phát Hiện",
      "Thợ Vận Hành",
      "Máy Gia Công",
      "SL Hỏng (NG)",
      "Nguồn Gốc Lỗi (Phân Loại)",
      "Mô Tả Khuyết Tật & Nguyên Nhân",
      "Biện Pháp Xử Lý (Hủy/Hàn/Sửa)",
      "Trách Nhiệm Chi Phí (Đúc / Thợ / Xưởng)"
    ],
    [
      "1",
      "2026-08-21",
      "PO-3733",
      "Win-Win",
      "ISHIZUE 318Dw800",
      "G/c hoàn thiện",
      "Đặng Ngọc Long",
      "Máy tiện FUJI",
      "2",
      "Lỗi Đúc Thép",
      "Phôi đúc bị rỗ xỉ và nứt ngầm bộc lộ khi tiện hớt lớp vỏ ngoài",
      "Hủy phôi, chuyển nấu đúc lại",
      "Tính vào chi phí Phân xưởng Đúc (Thợ vẫn được tính 100% công gọt)"
    ],
    [
      "2",
      "2026-08-22",
      "PO-3733",
      "Win-Win",
      "ISHIZUE 318Dw800",
      "G/c hoàn thiện",
      "Đặng Ngọc Long",
      "Máy tiện FUJI",
      "7",
      "Lỗi Đúc Thép",
      "Ngậm cát đúc làm mẻ chíp và rỗ bề mặt cánh xoắn",
      "Hàn đắp sửa chữa và tiện lại",
      "Phân xưởng Đúc chịu chi phí dao bù và que hàn"
    ],
    [
      "3",
      "2026-08-24",
      "PO-5313",
      "Thyssen",
      "Sealing trip, below",
      "G/c phay Mp NC2 Kt 95mm",
      "Phạm Văn Tráng",
      "Máy Phay OKK1",
      "1",
      "Lỗi Thao Tác Thợ",
      "Thợ đo sai cữ làm lẹm kích thước 0.3mm vượt dung sai bản vẽ",
      "Hạ cấp dùng làm mẫu thử nội bộ",
      "Trừ tiền khoán nguyên công và trừ 50% tiền mảnh chíp"
    ],
    [
      "4",
      "2026-08-26",
      "PO-7365",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "G/c phay NC1",
      "Phùng Đình Hùng",
      "Máy Phay OIGO",
      "1",
      "Lỗi Đúc Thép",
      "Phôi đúc Mn13 bị co ngót ở gân chịu lực chính",
      "Hủy chuyển lò luyện",
      "Khâu Đúc chịu trách nhiệm đúc bù phôi mới"
    ],
    [
      "5",
      "2026-08-28",
      "PO-4603",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền: Thân rô to",
      "G/c NC7 phay 8 mặt",
      "Vũ Tiến Thuận",
      "Máy tiện Tiện T1522",
      "1",
      "Lỗi Gá Kẹp / Thiết Bị",
      "Rơ bàn trượt máy phay làm sai lệch bước chia độ 8 mặt",
      "Hiệu chỉnh máy và phay bù lớp mỏng",
      "Phân xưởng Cơ khí chịu chi phí giờ máy căn chỉnh"
    ],
    [
      "6",
      "2026-08-29",
      "PO-3081",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "G/c khoan taro M14",
      "Nguyễn Trung Đông",
      "Máy Khoan cần Yoshida",
      "2",
      "Lỗi Dụng Cụ Cắt",
      "Mũi taro cùn bị gãy kẹt trong lỗ ren",
      "Chuyển máy bắn điện EDM lấy mũi taro",
      "Xưởng hỗ trợ chi phí bắn điện, nhắc nhở kiểm tra mòn dao"
    ],
    [
      "7",
      "2026-08-30",
      "PO-1456",
      "UCC",
      "Khuôn gá xích POWER",
      "G/c phay thô NC1",
      "Trần Văn Dũng",
      "Máy Phay CNC1",
      "1",
      "Lỗi Đúc Thép",
      "Phôi đúc hợp kim Cr12MoV bị xốp khí bên trong lòng khuôn",
      "Trả về kho phôi đúc hủy lô",
      "Phân xưởng Đúc xuất phôi bù"
    ]
  ],
  "09_Truy_Xuat_BTP_Luan_Chuyen": [
    [
      "SỔ TRUY XUẤT NGUỒN GỐC & BÀN GIAO BÁN THÀNH PHẨM (BTP) CƠ KHÍ"
    ],
    [
      "Phân xưởng Cơ khí | Truy xuất chuỗi: Đúc phôi -> Nhiệt luyện <-> Gia công nội bộ <-> Gia công ngoài (Sub-con) <-> Hoàn thiện"
    ],
    [
      "STT",
      "Ngày Luân Chuyển",
      "Mã PO / LSX",
      "Khách Hàng",
      "Tên Chi Tiết / Quy Cách",
      "Loại Luân Chuyển",
      "SL Bàn Giao",
      "Khâu Chuyển Đi (Nguồn)",
      "Khâu Tiếp Nhận (Đích)",
      "Số Phiếu / Biên Bản",
      "Người Bàn Giao",
      "Tình Trạng Kỹ Thuật / Ngoại Quan"
    ],
    [
      "1",
      "2026-08-15",
      "PO-2026-001",
      "Win-Win",
      "Trục Khuỷu Động Cơ Φ250",
      "Nội bộ -> Hoàn thiện",
      "500",
      "Xưởng Gia Công Cơ Khí",
      "Bộ phận Hoàn Thiện",
      "BB-BG-01",
      "Nguyễn Văn A",
      "Bàn giao BTP đợt 1 sang lắp ráp"
    ],
    [
      "2",
      "2026-08-18",
      "PO-2026-002",
      "UCC",
      "Khuôn gá xích POWER",
      "Nội bộ -> Nhiệt luyện",
      "200",
      "Xưởng Gia Công Cơ Khí",
      "Phân xưởng Nhiệt Luyện",
      "BB-BG-02",
      "Trần Văn B",
      "Phay thô xong, chuyển tôi thể tích"
    ],
    [
      "3",
      "2026-08-20",
      "PO-5999",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "Xuất GIA CÔNG NGOÀI",
      "30",
      "Xưởng Gia Công Cơ Khí",
      "Xưởng cơ khí Hoàng Mai (Vệ tinh)",
      "BB-SUB-01",
      "Vũ Tiến Thuận",
      "Xuất phôi đúc đi tiện thô NC1 do máy FUJI quá tải"
    ],
    [
      "4",
      "2026-08-22",
      "PO-2026-002",
      "UCC",
      "Khuôn gá xích POWER",
      "Nhiệt luyện -> Gia công",
      "200",
      "Phân xưởng Nhiệt Luyện",
      "Xưởng Gia Công Cơ Khí",
      "BB-BG-03",
      "Trần Văn B",
      "Đã tôi đạt 58 HRC, nhận về mài phẳng tinh"
    ],
    [
      "5",
      "2026-08-24",
      "PO-3733",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 318Dw800",
      "Xuất GIA CÔNG NGOÀI",
      "45",
      "Xưởng Gia Công Cơ Khí",
      "Công ty Cơ khí Tân Phát (Vệ tinh)",
      "BB-SUB-02",
      "Phạm Văn Tráng",
      "Xuất phôi tiện thô NC1 để kịp deadline"
    ],
    [
      "6",
      "2026-08-25",
      "PO-4545",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "Nội bộ -> Hoàn thiện",
      "2",
      "Xưởng Gia Công Cơ Khí",
      "Bộ phận Hoàn Thiện",
      "BB-BG-04",
      "Phạm Văn Tráng",
      "Cắt dây hoàn tất, chuyển mài vát & hoàn thiện"
    ],
    [
      "7",
      "2026-08-26",
      "PO-3275",
      "Thyssen",
      "Sealing trip, below",
      "Nội bộ -> Hoàn thiện",
      "55",
      "Xưởng Gia Công Cơ Khí",
      "Bộ phận Hoàn Thiện",
      "BB-BG-05",
      "Phùng Công Thắng",
      "Khoan lỗ hoàn tất, chuyển tẩy bavia"
    ],
    [
      "8",
      "2026-08-27",
      "PO-5999",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "Thu hồi từ GIA CÔNG NGOÀI",
      "30",
      "Xưởng cơ khí Hoàng Mai",
      "Xưởng Gia Công Cơ Khí",
      "BB-REC-01",
      "KCS / Nghiệm thu",
      "Đã tiện thô đạt kích thước, chuyển máy FUJI tiện tinh NC3"
    ],
    [
      "9",
      "2026-08-28",
      "PO-1602",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "Nội bộ -> Nhiệt luyện",
      "1",
      "Xưởng Gia Công Cơ Khí",
      "Phân xưởng Nhiệt Luyện",
      "BB-BG-06",
      "Phùng Đình Hùng",
      "Phay xong rãnh, chuyển tôi cao tần"
    ],
    [
      "10",
      "2026-08-29",
      "PO-8134",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền: Thân rô to",
      "Nội bộ -> Hoàn thiện",
      "15",
      "Xưởng Gia Công Cơ Khí",
      "Bộ phận Hoàn Thiện",
      "BB-BG-07",
      "Vũ Tiến Thuận",
      "Hoàn tất NC9 khoan taro, chuyển lắp cụm"
    ]
  ],
  "10_Bang_Luong_Khoan_Tho": [
    [
      "BẢNG TỔNG HỢP LƯƠNG KHOÁN THEO CÔNG NHÂN & THEO DÕI NĂNG SUẤT"
    ],
    [
      "Phân xưởng Gia công Cơ khí | Tự động tổng hợp từ Nhật ký ca: Sản lượng OK - Sản lượng hỏng NG - Tiền khoán ca - Thưởng/Phạt dao cụ -> Thực lĩnh khoán"
    ],
    [
      "STT",
      "Mã NV",
      "Họ Và Tên Thợ Gia Công",
      "Máy Vận Hành Chính",
      "Số Ca Làm Việc",
      "Tổng Giờ Chạy Máy (h)",
      "Tổng SL Đạt (OK)",
      "Tổng SL Hỏng (NG)",
      "Tổng Tiền Khoán (VNĐ)",
      "Trừ Phạt Phế Phẩm/Dao",
      "LƯƠNG KHOÁN THỰC LĨNH (VNĐ)"
    ],
    [
      "1",
      "NV01",
      "Hoàng Ngọc Hà",
      "Máy tiện OKUMA"
    ],
    [
      "2",
      "NV02",
      "Nguyễn Trung Đông",
      "Máy tiện FUJI"
    ],
    [
      "3",
      "NV03",
      "Phùng Đình Hùng",
      "Máy tiện Tiện T1516"
    ],
    [
      "4",
      "NV04",
      "Vũ Tiến Thuận",
      "Máy tiện Tiện T1517"
    ],
    [
      "5",
      "NV05",
      "Nguyễn Mạnh Hà",
      "Máy Phay OKK1"
    ],
    [
      "6",
      "NV06",
      "Nguyễn Văn Thanh",
      "Máy tiện OKUMA"
    ],
    [
      "7",
      "NV07",
      "Phùng Gia Phúc",
      "Máy Phay OKK3"
    ],
    [
      "8",
      "NV08",
      "Trần Văn Dũng",
      "Máy Phay CNC1"
    ],
    [
      "9",
      "NV09",
      "Trần Đăng Ninh",
      "Máy Phay CNC2"
    ],
    [
      "10",
      "NV10",
      "Phạm Văn Tráng",
      "Máy Phay OKK1"
    ],
    [
      "11",
      "NV11",
      "Đặng Ngọc Long",
      "Máy tiện FUJI"
    ],
    [
      "12",
      "NV12",
      "Phùng Công Thắng",
      "Máy Cắt Dây DK7745"
    ],
    [
      "TỔNG CỘNG QUỸ LƯƠNG KHOÁN"
    ]
  ],
  "11_Master_Data": [
    [
      "DANH MỤC MASTER DATA: KHÁCH HÀNG, ĐƠN GIÁ GIỜ MÁY & ĐƠN VỊ GIA CÔNG NGOÀI"
    ],
    [],
    [
      "DANH SÁCH KHÁCH HÀNG",
      "",
      "",
      "BẢNG ĐƠN GIÁ GIỜ MÁY NỘI BỘ",
      "",
      "",
      "",
      "DANH BẠ ĐƠN VỊ VỆ TINH GIA CÔNG NGOÀI (SUB-CON)"
    ],
    [
      "Mã KH",
      "Tên Đối Tác / Khách Hàng",
      "",
      "STT",
      "Dòng Máy / Thiết Bị",
      "Đơn Giá Giờ Máy (VNĐ/h)",
      "",
      "Mã Vệ Tinh",
      "Tên Doanh Nghiệp Vệ Tinh",
      "Năng Lực Gia Công Mạnh",
      "Đánh Giá Uy Tín KCS"
    ],
    [
      "KH01",
      "Thyssen",
      "",
      "1",
      "Máy tiện Tiện T1516 / T1517 / T1522 (Tiện đứng nặng)",
      "320000",
      "",
      "SUB-01",
      "Xưởng cơ khí Hoàng Mai",
      "Tiện CNC đường kính lớn Ø300 - Ø800",
      "Hạng A (Rất tốt)"
    ],
    [
      "KH02",
      "Win-Win",
      "",
      "2",
      "Máy Phay OIGO / Phay giường hạng nặng",
      "280000",
      "",
      "SUB-02",
      "Công ty Cơ khí Tân Phát",
      "Tiện CNC cánh xoắn vít đùn",
      "Hạng A (Rất tốt)"
    ],
    [
      "KH03",
      "Vico- QLTB",
      "",
      "3",
      "Máy Phay OKK1 / OKK2 / OKK3 (Phay CNC)",
      "250000",
      "",
      "SUB-03",
      "Xưởng Phay Giường Đức Long",
      "Phay giường phôi đúc nặng đến 5 tấn",
      "Hạng B (Đạt yêu cầu)"
    ],
    [
      "KH04",
      "Luợng- KS Tường Long",
      "",
      "4",
      "Máy Phay CNC1 / CNC2",
      "220000",
      "",
      "SUB-04",
      "Cắt dây CNC Nam Định",
      "Cắt dây Molypden độ dày đến 400mm",
      "Hạng A (Rất tốt)"
    ],
    [
      "KH05",
      "Molycop",
      "",
      "5",
      "Máy tiện FUJI / OKUMA / T630 / CNC1",
      "220000",
      "",
      "SUB-05",
      "Cơ khí Chính xác An Phát",
      "Phay CNC 3-4 trục, làm hốc khuôn",
      "Hạng A (Rất tốt)"
    ],
    [
      "KH06",
      "Hà Song Hải - XM Hạ Long",
      "",
      "6",
      "Máy Cắt Dây DK7745 / DK7780 / Podatech",
      "110000"
    ],
    [
      "KH07",
      "Hải- Vinh Quảng Ninh",
      "",
      "7",
      "Máy Khoan cần Yoshida",
      "130000"
    ],
    [
      "KH08",
      "TFG"
    ],
    [
      "KH09",
      "UCC"
    ]
  ]
};

function setup11ChuanHoaSheets() {
  var ss = getSpreadsheet();

  // Đảm bảo tồn tại Sheet 'Nhật Ký Sản Lượng'
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet) {
    logSheet = ss.insertSheet("Nhật Ký Sản Lượng");
    var defaultHeaders = [
      "STT", "Thời Gian Gửi", "Ngày Làm", "Họ Tên Công Nhân", "Khách Hàng", "Tên Sản Phẩm",
      "Số PO", "Nguyên Công", "Máy Gia Công", "SL Đạt (OK)", "SL Xử Lý", "SL Hủy",
      "Lương Khoán (VNĐ)", "Vật Tư / Chip", "SL Tiêu Hao", "Phút Dừng Máy", "Ghi Chú", "Link Ảnh Drive"
    ];
    logSheet.appendRow(defaultHeaders);
    logSheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight("bold").setBackground("#059669").setFontColor("#ffffff");
  }

  // Khởi tạo từng sheet chuẩn hóa (Dữ liệu tĩnh & Tiêu đề chuyên nghiệp)
  for (var sName in STANDARDIZED_SHEETS_DATA) {
    var sheetRows = STANDARDIZED_SHEETS_DATA[sName];
    if (!sheetRows || sheetRows.length === 0) continue;

    var sh = ss.getSheetByName(sName) || ss.insertSheet(sName);

    var maxCols = 0;
    for (var r = 0; r < sheetRows.length; r++) {
      if (sheetRows[r].length > maxCols) maxCols = sheetRows[r].length;
    }
    if (maxCols === 0) continue;

    var matrix = [];
    for (var r = 0; r < sheetRows.length; r++) {
      var row = sheetRows[r].slice();
      while (row.length < maxCols) row.push("");
      matrix.push(row);
    }

    sh.clear();
    var range = sh.getRange(1, 1, matrix.length, maxCols);
    range.setValues(matrix);

    // Định dạng tiêu đề & Cố định dòng
    try {
      sh.getRange(1, 1, 1, maxCols).setFontWeight("bold").setFontSize(13);
      if (matrix.length >= 3) {
        sh.getRange(3, 1, 1, maxCols)
          .setFontWeight("bold")
          .setBackground("#059669")
          .setFontColor("#ffffff")
          .setHorizontalAlignment("center");
        sh.setRowHeight(3, 30);
        sh.setFrozenRows(3);
      }
      sh.setHiddenGridlines(false);
    } catch (eStyle) {
      console.log(eStyle);
    }
  }

  // Xóa các sheet máy lẻ cũ
  try {
    deleteOld17MachineSheets();
  } catch (eDel) {
    console.log(eDel);
  }

  // TÍNH TOÁN & CẬP NHẬT TRỰC TIẾP TOÀN BỘ SỐ LIỆU TỪ 'Nhật Ký Sản Lượng' (100% SẠCH LỖI #ERROR!)
  calculateAndPopulateAllSheets();

  SpreadsheetApp.flush();
  Logger.log("✅ ĐÃ KHỞI TẠO THÀNH CÔNG BỘ 11 SHEET CHUẨN HÓA 100% SẠCH LỖI #ERROR!");
  return "Đã khởi tạo thành công trọn bộ 11 Sheet chuẩn hóa và xóa sạch 100% lỗi #ERROR!";
}

// 🛠️ HÀM TÍNH TOÁN & ĐỒNG BỘ TRỰC TIẾP TỪ 'Nhật Ký Sản Lượng' (XÓA SẠCH 100% LỖI #ERROR!)
function calculateAndPopulateAllSheets() {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet) return "Chưa có sheet Nhật Ký Sản Lượng";

  // 1. TỔNG HỢP DỮ LIỆU THỰC TẾ TỪ 'Nhật Ký Sản Lượng'
  var poOkMap = {};       // { po: totalOk }
  var workerShifts = {};  // { worker: shiftCount }
  var workerOk = {};      // { worker: totalOk }
  var workerNg = {};      // { worker: totalNg }
  var workerWage = {};    // { worker: totalWage }
  var machineHours = {};  // { machine: totalHours }

  if (logSheet.getLastRow() > 1) {
    var logData = logSheet.getDataRange().getValues();
    for (var i = 1; i < logData.length; i++) {
      var wName = logData[i][3] ? String(logData[i][3]).trim() : "";
      var po = logData[i][6] ? String(logData[i][6]).trim() : "";
      var mName = logData[i][8] ? String(logData[i][8]).trim() : "";
      var qtyDat = Number(logData[i][9] || 0);
      var qtyHuy = Number(logData[i][11] || 0);
      var wage = Number(logData[i][12] || 0);

      if (po) {
        poOkMap[po] = (poOkMap[po] || 0) + qtyDat;
      }
      if (wName) {
        workerShifts[wName] = (workerShifts[wName] || 0) + 1;
        workerOk[wName] = (workerOk[wName] || 0) + qtyDat;
        workerNg[wName] = (workerNg[wName] || 0) + qtyHuy;
        workerWage[wName] = (workerWage[wName] || 0) + wage;
      }
      if (mName) {
        machineHours[mName] = (machineHours[mName] || 0) + 8;
      }
    }
  }

  // 2. TỔNG HỢP SỐ LIỆU GIAO HÀNG TỪ '09_Truy_Xuat_BTP_Luan_Chuyen'
  var btpSheet = ss.getSheetByName("09_Truy_Xuat_BTP_Luan_Chuyen");
  var poDeliveredMap = {};
  if (btpSheet && btpSheet.getLastRow() > 3) {
    var btpData = btpSheet.getDataRange().getValues();
    for (var b = 3; b < btpData.length; b++) {
      var bPo = btpData[b][2] ? String(btpData[b][2]).trim() : "";
      var bQty = Number(btpData[b][6] || 0);
      if (bPo) {
        poDeliveredMap[bPo] = (poDeliveredMap[bPo] || 0) + bQty;
      }
    }
  }

  // 3. TÍNH TOÁN & CẬP NHẬT SHEET '06_Ke_Hoach_Tien_Do_PO'
  var poSheet = ss.getSheetByName("06_Ke_Hoach_Tien_Do_PO");
  var totalBtpXong = 0;
  var totalWip = 0;
  var countActivePo = 0;
  var customerStats = {}; // { customerName: { countPo, planQty, doneQty, delQty, wipQty } }

  if (poSheet && poSheet.getLastRow() > 3) {
    var poRows = poSheet.getDataRange().getValues();
    for (var p = 3; p < poRows.length; p++) {
      var rowNum = p + 1;
      var curPo = poRows[p][1] ? String(poRows[p][1]).trim() : "";
      var curCustomer = poRows[p][2] ? String(poRows[p][2]).trim() : "";
      var qtyPlan = Number(poRows[p][4] || 0);

      if (!curPo) continue;
      countActivePo++;

      var btpXong = poOkMap[curPo] || 0;
      var daGiao = poDeliveredMap[curPo] || 0;
      var tonWip = Math.max(0, btpXong - daGiao);
      var conNo = Math.max(0, qtyPlan - daGiao);
      var pct = qtyPlan > 0 ? (daGiao / qtyPlan) : 0;

      var status = "Chờ nhận phôi đúc";
      if (daGiao >= qtyPlan && qtyPlan > 0) {
        status = "Đã bàn giao đủ";
      } else if (btpXong >= qtyPlan && qtyPlan > 0) {
        status = "Xong xưởng - Chờ chuyển";
      } else if (btpXong > 0) {
        status = "Đang gia công trên máy";
      }

      totalBtpXong += btpXong;
      totalWip += tonWip;

      // Gom thống kê khách hàng
      if (curCustomer) {
        if (!customerStats[curCustomer]) {
          customerStats[curCustomer] = { countPo: 0, planQty: 0, doneQty: 0, delQty: 0, wipQty: 0 };
        }
        customerStats[curCustomer].countPo++;
        customerStats[curCustomer].planQty += qtyPlan;
        customerStats[curCustomer].doneQty += btpXong;
        customerStats[curCustomer].delQty += daGiao;
        customerStats[curCustomer].wipQty += tonWip;
      }

      // Ghi số liệu thực tế vào các cột F, G, H, I, M, N (Tuyệt đối không dính lỗi #ERROR!)
      poSheet.getRange(rowNum, 6).setValue(btpXong);
      poSheet.getRange(rowNum, 7).setValue(daGiao);
      poSheet.getRange(rowNum, 8).setValue(tonWip);
      poSheet.getRange(rowNum, 9).setValue(conNo);
      poSheet.getRange(rowNum, 13).setValue(pct).setNumberFormat("0.0%");
      poSheet.getRange(rowNum, 14).setValue(status);
    }
  }

  // 4. TÍNH TOÁN & CẬP NHẬT SHEET '10_Bang_Luong_Khoan_Tho'
  var wageSheet = ss.getSheetByName("10_Bang_Luong_Khoan_Tho");
  if (wageSheet && wageSheet.getLastRow() > 3) {
    var wRows = wageSheet.getDataRange().getValues();
    var sumShifts = 0, sumHours = 0, sumOk = 0, sumNg = 0, sumWage = 0, sumPenalty = 0, sumNet = 0;

    for (var w = 3; w < wRows.length; w++) {
      var rWageNum = w + 1;
      var workerName = wRows[w][2] ? String(wRows[w][2]).trim() : "";
      var isTotalRow = wRows[w][0] && String(wRows[w][0]).indexOf("TỔNG") >= 0;

      if (isTotalRow) {
        // Dòng tổng cộng quỹ lương
        wageSheet.getRange(rWageNum, 5).setValue(sumShifts);
        wageSheet.getRange(rWageNum, 6).setValue(sumHours);
        wageSheet.getRange(rWageNum, 7).setValue(sumOk);
        wageSheet.getRange(rWageNum, 8).setValue(sumNg);
        wageSheet.getRange(rWageNum, 9).setValue(sumWage).setNumberFormat("#,##0");
        wageSheet.getRange(rWageNum, 10).setValue(sumPenalty).setNumberFormat("#,##0");
        wageSheet.getRange(rWageNum, 11).setValue(sumNet).setNumberFormat("#,##0");
        break;
      }

      if (!workerName) continue;

      var shifts = workerShifts[workerName] || 0;
      var hours = shifts * 8;
      var ok = workerOk[workerName] || 0;
      var ng = workerNg[workerName] || 0;
      var wageVal = workerWage[workerName] || 0;
      var penalty = 0;
      var net = Math.max(0, wageVal - penalty);

      sumShifts += shifts;
      sumHours += hours;
      sumOk += ok;
      sumNg += ng;
      sumWage += wageVal;
      sumPenalty += penalty;
      sumNet += net;

      // Ghi số liệu thực tế vào các cột E, F, G, H, I, J, K (Tuyệt đối không dính lỗi #ERROR!)
      wageSheet.getRange(rWageNum, 5).setValue(shifts);
      wageSheet.getRange(rWageNum, 6).setValue(hours);
      wageSheet.getRange(rWageNum, 7).setValue(ok);
      wageSheet.getRange(rWageNum, 8).setValue(ng);
      wageSheet.getRange(rWageNum, 9).setValue(wageVal).setNumberFormat("#,##0");
      wageSheet.getRange(rWageNum, 10).setValue(penalty).setNumberFormat("#,##0");
      wageSheet.getRange(rWageNum, 11).setValue(net).setNumberFormat("#,##0");
    }
  }

  // 5. TÍNH TOÁN & CẬP NHẬT SHEET '03_Can_Bang_Tai_17_May'
  var maySheet = ss.getSheetByName("03_Can_Bang_Tai_17_May");
  var countNghenNang = 0;
  if (maySheet && maySheet.getLastRow() > 3) {
    var mRows = maySheet.getDataRange().getValues();
    for (var m = 3; m < mRows.length; m++) {
      var rMayNum = m + 1;
      var machineName = mRows[m][1] ? String(mRows[m][1]).trim() : "";
      var capHours = Number(mRows[m][4] || 96);
      var runHours = Number(mRows[m][5] || 0);

      // Nếu có nhật ký thực tế thì cộng thêm
      if (machineName && machineHours[machineName]) {
        runHours = Math.max(runHours, machineHours[machineName]);
        maySheet.getRange(rMayNum, 6).setValue(runHours);
      }

      var loadRate = capHours > 0 ? (runHours / capHours) : 0;
      var statusMay = "DƯ NĂNG LỰC";
      if (loadRate > 1.2) {
        statusMay = "NGHẼN NẶNG";
        countNghenNang++;
      } else if (loadRate >= 1.0) {
        statusMay = "CẢNH BÁO QUÁ TẢI";
      } else if (loadRate >= 0.75) {
        statusMay = "TẢI TỐI ƯU";
      }

      var thieuHut = Math.max(0, runHours - capHours);

      maySheet.getRange(rMayNum, 7).setValue(loadRate).setNumberFormat("0.0%");
      maySheet.getRange(rMayNum, 8).setValue(statusMay);
      maySheet.getRange(rMayNum, 9).setValue(thieuHut);
    }
  }

  // 6. TÍNH TOÁN & CẬP NHẬT SHEET '01_Tong_Quan_Dashboard'
  var dashSheet = ss.getSheetByName("01_Tong_Quan_Dashboard");
  if (dashSheet) {
    // Cập nhật thẻ KPIs ở dòng 5
    dashSheet.getRange("B5").setValue(countActivePo);
    dashSheet.getRange("D5").setValue(totalBtpXong);
    dashSheet.getRange("F5").setValue(totalWip);
    dashSheet.getRange("H5").setValue(countNghenNang);
    dashSheet.getRange("J5").setValue(5); // Số PO đề xuất thuê ngoài

    // Cập nhật bảng đối tác khách hàng (Dòng 9 đến dòng 17)
    var dRows = dashSheet.getDataRange().getValues();
    var sumCustPo = 0, sumCustPlan = 0, sumCustDone = 0, sumCustDel = 0, sumCustWip = 0;

    for (var c = 8; c < Math.min(17, dRows.length); c++) {
      var rDashNum = c + 1;
      var cName = dRows[c][1] ? String(dRows[c][1]).trim() : "";
      if (!cName) continue;

      // Tìm khớp tên khách hàng
      var foundKey = null;
      for (var k in customerStats) {
        if (k.toLowerCase().indexOf(cName.toLowerCase()) >= 0 || cName.toLowerCase().indexOf(k.toLowerCase()) >= 0) {
          foundKey = k;
          break;
        }
      }

      var cPo = foundKey ? customerStats[foundKey].countPo : 0;
      var cPlan = foundKey ? customerStats[foundKey].planQty : 0;
      var cDone = foundKey ? customerStats[foundKey].doneQty : 0;
      var cDel = foundKey ? customerStats[foundKey].delQty : 0;
      var cWip = foundKey ? customerStats[foundKey].wipQty : 0;

      sumCustPo += cPo;
      sumCustPlan += cPlan;
      sumCustDone += cDone;
      sumCustDel += cDel;
      sumCustWip += cWip;

      dashSheet.getRange(rDashNum, 4).setValue(cPo);
      dashSheet.getRange(rDashNum, 5).setValue(cPlan);
      dashSheet.getRange(rDashNum, 6).setValue(cDone);
      dashSheet.getRange(rDashNum, 7).setValue(cDel);
      dashSheet.getRange(rDashNum, 8).setValue(cWip);
    }

    // Dòng 18: TỔNG CỘNG TOÀN NHÀ MÁY
    if (dashSheet.getLastRow() >= 18) {
      dashSheet.getRange(18, 4).setValue(sumCustPo);
      dashSheet.getRange(18, 5).setValue(sumCustPlan);
      dashSheet.getRange(18, 6).setValue(sumCustDone);
      dashSheet.getRange(18, 7).setValue(sumCustDel);
      dashSheet.getRange(18, 8).setValue(sumCustWip);
    }
  }

  SpreadsheetApp.flush();
  Logger.log("✅ ĐÃ TÍNH TOÁN & CẬP NHẬT TRỰC TIẾP TOÀN BỘ SHEET THÀNH CÔNG 100% SẠCH LỖI #ERROR!");
  return "Đã xóa sạch 100% lỗi #ERROR! và cập nhật toàn bộ số liệu thực tế thành công!";
}


// ==============================================================================
// 🎨 HÀM KẺ Ô VIỀN & ĐỊNH DẠNG CHUYÊN NGHIỆP TOÀN DIỆN CHO TẤT CẢ CÁC SHEET
// ==============================================================================
function formatAllSheetsProfessionally() {
  var ss = getSpreadsheet();
  var allSheets = ss.getSheets();
  
  allSheets.forEach(function(sh) {
    var sName = sh.getName();
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return;

    try {
      // 1. Luôn hiển thị đường lưới Google Sheet
      sh.setHiddenGridlines(false);

      // 2. Định dạng toàn bộ bảng tính với font chữ hiện đại & căn giữa theo chiều dọc
      var fullRange = sh.getRange(1, 1, lastRow, lastCol);
      fullRange.setFontFamily("Roboto")
               .setVerticalAlignment("middle");

      // 3. Kẻ ô kẻ dòng sắc nét (Borders) cho toàn bộ vùng dữ liệu
      fullRange.setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

      // 4. Định dạng Dòng 1 (Tiêu Đề Lớn) & Dòng 2 (Mô tả phụ)
      sh.getRange(1, 1).setFontSize(13).setFontWeight("bold").setFontColor("#0f172a");
      sh.setRowHeight(1, 36);
      if (lastRow >= 2) {
        sh.getRange(2, 1).setFontSize(9.5).setFontStyle("italic").setFontColor("#64748b");
        sh.setRowHeight(2, 22);
      }

      // Xác định dòng tiêu đề cột (Thường là dòng 3 hoặc dòng 1 với Nhật Ký Sản Lượng)
      var headerRow = (sName === "Nhật Ký Sản Lượng") ? 1 : 3;
      if (sName === "02_Canh_Bao_Qua_Tai_SubCon") headerRow = 4;
      if (sName === "11_Master_Data") headerRow = 4;

      if (lastRow >= headerRow) {
        var headerRange = sh.getRange(headerRow, 1, 1, lastCol);
        
        // Màu tiêu đề ĐỒNG BỘ 100% cho TẤT CẢ CÁC SHEET (Xanh Ngọc Lục Bảo Emerald tươi tắn, sáng đẹp & sang trọng)
        var headerBg = "#059669"; 
        var headerBorderColor = "#047857";

        headerRange.setFontWeight("bold")
                   .setFontSize(10.5)
                   .setBackground(headerBg)
                   .setFontColor("#ffffff")
                   .setHorizontalAlignment("center");
        sh.setRowHeight(headerRow, 34);
        sh.setFrozenRows(headerRow);
        
        // Viền sắc nét cho dòng tiêu đề
        headerRange.setBorder(true, true, true, true, true, true, headerBorderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }

      // 5. Định dạng các dòng dữ liệu (Zebra Striping & Căn lề thông minh)
      var dataStartRow = headerRow + 1;
      if (lastRow >= dataStartRow) {
        var numDataRows = lastRow - dataStartRow + 1;
        var headerValues = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];

        // Lập ma trận màu so le (Zebra striping)
        var bgMatrix = [];
        for (var r = 0; r < numDataRows; r++) {
          var rowIdx = dataStartRow + r;
          sh.setRowHeight(rowIdx, 26);
          var rowBg = (r % 2 === 0) ? "#ffffff" : "#f8fafc";
          var rowColors = [];
          for (var c = 0; c < lastCol; c++) rowColors.push(rowBg);
          bgMatrix.push(rowColors);
        }
        sh.getRange(dataStartRow, 1, numDataRows, lastCol).setBackgrounds(bgMatrix);

        // Căn lề thông minh theo tiêu đề từng cột
        for (var col = 1; col <= lastCol; col++) {
          var hVal = String(headerValues[col - 1] || "").toLowerCase();
          var colDataRange = sh.getRange(dataStartRow, col, numDataRows, 1);

          if (hVal.indexOf("stt") >= 0 || hVal.indexOf("mã") >= 0 || hVal.indexOf("ngày") >= 0 || 
              hVal.indexOf("thời gian") >= 0 || hVal.indexOf("thứ tự") >= 0 || hVal.indexOf("đvt") >= 0) {
            colDataRange.setHorizontalAlignment("center");
          } else if (hVal.indexOf("sl") >= 0 || hVal.indexOf("lương") >= 0 || hVal.indexOf("tiền") >= 0 || 
                     hVal.indexOf("giá") >= 0 || hVal.indexOf("giờ") >= 0 || hVal.indexOf("phút") >= 0 || 
                     hVal.indexOf("%") >= 0 || hVal.indexOf("khối lượng") >= 0 || hVal.indexOf("đạt") >= 0 || 
                     hVal.indexOf("hỏng") >= 0 || hVal.indexOf("tiêu hao") >= 0) {
            colDataRange.setHorizontalAlignment("right");
          } else {
            colDataRange.setHorizontalAlignment("left");
          }

          // Căn lề đặc biệt cho cột trạng thái / đánh giá
          if (hVal.indexOf("trạng thái") >= 0 || hVal.indexOf("đánh giá") >= 0) {
            colDataRange.setHorizontalAlignment("center").setFontWeight("bold");
          }
        }

        // Kiểm tra dòng Tổng Cộng cuối bảng (nếu có)
        var lastRowFirstCell = String(sh.getRange(lastRow, 1).getValue() || "").toUpperCase();
        if (lastRowFirstCell.indexOf("TỔNG") >= 0) {
          var totalRange = sh.getRange(lastRow, 1, 1, lastCol);
          totalRange.setFontWeight("bold")
                    .setBackground("#f1f5f9")
                    .setBorder(true, true, true, true, true, true, "#475569", SpreadsheetApp.BorderStyle.SOLID);
          sh.setRowHeight(lastRow, 30);
        }
      }

      // 6. Tự động căn chỉnh độ rộng cột vừa vặn
      for (var colIdx = 1; colIdx <= Math.min(lastCol, 20); colIdx++) {
        try {
          sh.autoResizeColumn(colIdx);
          var colW = sh.getColumnWidth(colIdx);
          if (colW < 75) sh.setColumnWidth(colIdx, 75);
          else if (colW > 380) sh.setColumnWidth(colIdx, 380);
        } catch (eCol) {}
      }

    } catch (eSheet) {
      console.log("Lỗi định dạng sheet " + sName + ": " + eSheet.toString());
    }
  });

  SpreadsheetApp.flush();
  Logger.log("✅ ĐÃ KẺ Ô KẺ DÒNG & ĐỊNH DẠNG CHUYÊN NGHIỆP TOÀN BỘ CÁC SHEET!");
  return "Đã kẻ ô viền và định dạng chuyên nghiệp toàn bộ các sheet thành công!";
}
