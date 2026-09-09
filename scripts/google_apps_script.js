/* ============================================================
   Commander City — Shuttle Pass Google Sheets Sync Script
   Paste this code into Google Sheets > Extensions > Apps Script
   ============================================================ */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    if (data.type === "TEST_CONNECTION") {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Google Sheets Sync Connected Successfully!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var passes = data.passes || [];
    var members = data.members || [];

    if (!passes || passes.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "No passes to sync" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Filter out unverified passes (strictly only sync Manager Verified passes)
    var verifiedPasses = passes.filter(function(p) { return p.verified === true; });

    // Group verified passes by month and year
    var monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var grouped = {};

    verifiedPasses.forEach(function(p) {
      var m = p.month || (new Date().getMonth() + 1);
      var y = p.year || new Date().getFullYear();
      var sheetName = (monthNames[m] || ("Month_" + m)) + " " + y;
      if (!grouped[sheetName]) grouped[sheetName] = [];
      grouped[sheetName].push(p);
    });

    for (var sheetName in grouped) {
      var sheetPasses = grouped[sheetName];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      // Clear existing content
      sheet.clearContents();

      // Headers
      var headers = [
        "Serial #", "Member Code", "Member Name", "CNIC", 
        "House / Plot No", "Contact", "Pass Type", "Amount (PKR)", 
        "Issue Date", "Valid Till", "Status", "Manager Verification", "Verified By", "Verified At"
      ];
      sheet.appendRow(headers);

      // Header styling
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#1e293b");
      headerRange.setFontColor("#ffffff");

      // Sort by serial number ascending
      sheetPasses.sort(function(a, b) {
        return (parseInt(a.serialNo) || 0) - (parseInt(b.serialNo) || 0);
      });

      var rows = [];
      var totalAmount = 0;

      sheetPasses.forEach(function(p) {
        var amt = Number(p.amount) || 0;
        totalAmount += amt;
        var memberCode = p.memberId ? ("CC-" + ("00000" + p.memberId).slice(-5)) : "CC-00000";
        var vStatus = (p.verified === true) ? "Manager Verified 🟢" : "Pending Verification 🟡";
        var vBy = p.verifiedBy || "N/A";
        var vAt = p.verifiedAt ? new Date(p.verifiedAt).toLocaleString() : "N/A";

        rows.push([
          "#" + (p.serialNo || ""),
          memberCode,
          p.memberName || "",
          p.cnic || "N/A",
          p.houseNo || "N/A",
          p.contact || "",
          (p.passType || "Full").toUpperCase(),
          amt,
          p.issueDate || "",
          p.validTill || "",
          (p.status || "active").toUpperCase(),
          vStatus,
          vBy,
          vAt
        ]);
      });

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }

      // Append Total Summary Row
      var totalRow = ["TOTAL CARDS: " + rows.length, "", "", "", "", "", "TOTAL AMOUNT:", totalAmount, "", "", "", "", "", ""];
      sheet.appendRow(totalRow);

      var lastRowIndex = sheet.getLastRow();
      var totalRange = sheet.getRange(lastRowIndex, 1, 1, headers.length);
      totalRange.setFontWeight("bold");
      totalRange.setBackground("#f1f5f9");

      // Auto-fit columns
      for (var col = 1; col <= headers.length; col++) {
        sheet.autoResizeColumn(col);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", count: verifiedPasses.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
