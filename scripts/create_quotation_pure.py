import os
import sys
import zipfile

def build_word_document():
    # XML Components for standard DOCX

    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""

    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    doc_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:docDefaults>
        <w:rPrDefault>
            <w:rPr>
                <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
                <w:sz w:val="22"/>
                <w:color w:val="1E293B"/>
            </w:rPr>
        </w:rPrDefault>
    </w:docDefaults>
</w:styles>"""

    # Main Document XML Construction
    doc_xml_body = []
    
    # Namespace declaration
    doc_xml_start = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>"""

    # 1. Header Banner Table (Navy Background)
    header_table = """
    <w:tbl>
        <w:tblPr>
            <w:tblW w:w="9600" w:type="dxa"/>
            <w:tblJustification w:val="center"/>
            <w:tblBorders>
                <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
                <w:insideH w:val="none"/><w:insideV w:val="none"/>
            </w:tblBorders>
        </w:tblPr>
        <w:tr>
            <w:tc>
                <w:tcPr>
                    <w:tcW w:w="9600" w:type="dxa"/>
                    <w:shd w:val="clear" w:color="auto" w:fill="1E3A8A"/>
                    <w:tcMar>
                        <w:top w:w="300" w:type="dxa"/><w:bottom w:w="300" w:type="dxa"/>
                        <w:left w:w="300" w:type="dxa"/><w:right w:w="300" w:type="dxa"/>
                    </w:tcMar>
                </w:tcPr>
                <w:p>
                    <w:pPr><w:jc w:val="center"/><w:spacing w:after="100"/></w:pPr>
                    <w:r>
                        <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="38"/><w:color w:val="FFFFFF"/></w:rPr>
                        <w:t>COMMANDER CITY SHUTTLE PASS SYSTEM</w:t>
                    </w:r>
                </w:p>
                <w:p>
                    <w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>
                    <w:r>
                        <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="24"/><w:color w:val="F59E0B"/></w:rPr>
                        <w:t>SOFTWARE QUOTATION &amp; MONTHLY MEMBERSHIP APPROVAL REQUEST</w:t>
                    </w:r>
                </w:p>
            </w:tc>
        </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>
    """
    doc_xml_body.append(header_table)

    # 2. Metadata Grid Table
    meta_table = """
    <w:tbl>
        <w:tblPr>
            <w:tblW w:w="9600" w:type="dxa"/>
            <w:tblJustification w:val="center"/>
            <w:tblBorders>
                <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
                <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
                <w:left w:val="none"/><w:right w:val="none"/>
                <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
                <w:insideV w:val="none"/>
            </w:tblBorders>
        </w:tblPr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Document Ref: </w:t></w:r><w:r><w:t>CC-SPS-QT-2026-09</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Date: </w:t></w:r><w:r><w:t>September 02, 2026</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Project Name: </w:t></w:r><w:r><w:t>Shuttle Pass Renewal &amp; Management System</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>System Capacity: </w:t></w:r><w:r><w:t>Up to 10,000 Active Pass Holders</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Prepared For: </w:t></w:r><w:r><w:t>Management &amp; Board of Directors</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Prepared By: </w:t></w:r><w:r><w:t>Software &amp; IT Engineering Team</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Pricing Plan: </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val="D97706"/></w:rPr><w:t>PKR 10,000 / Month Membership</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Approval Status: </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>Submitted for Sign-off</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:spacing w:after="240"/></w:pPr></w:p>
    """
    doc_xml_body.append(meta_table)

    # 3. Section 1: Executive Summary
    sec1 = """
    <w:p>
        <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
        <w:r>
            <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="28"/><w:color w:val="1E3A8A"/></w:rPr>
            <w:t>1. Executive Summary</w:t>
        </w:r>
    </w:p>
    <w:p>
        <w:pPr><w:spacing w:after="160"/><w:line w:line="276" w:lineRule="auto"/></w:pPr>
        <w:r>
            <w:t>The Commander City Shuttle Pass System is a purpose-built, high-performance web application designed to completely digitalize and streamline monthly shuttle pass issuance, renewal tracking, and transport access control across Commander City. Built to support </w:t>
        </w:r>
        <w:r>
            <w:rPr><w:b/></w:rPr>
            <w:t>up to 10,000 active member passes</w:t>
        </w:r>
        <w:r>
            <w:t>, the application replaces slow, error-prone paper ledgers with instant digital pass issuance, auto-formatted monthly serial numbers, live Google Sheets synchronization, and 1-click batch renewals.</w:t>
        </w:r>
    </w:p>
    """
    doc_xml_body.append(sec1)

    # 4. Section 2: Key Features & Plus Points
    sec2_head = """
    <w:p>
        <w:pPr><w:spacing w:before="280" w:after="140"/></w:pPr>
        <w:r>
            <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="28"/><w:color w:val="1E3A8A"/></w:rPr>
            <w:t>2. Standout Plus-Point Features &amp; Technical Capabilities</w:t>
        </w:r>
    </w:p>
    """
    doc_xml_body.append(sec2_head)

    features = [
        ("⚡ 1-Click Monthly Bulk Renewal Engine",
         "Allows administrators to renew all active members into the next calendar month in a single click (under 3 seconds). Automatically updates start/end validity dates and increments monthly serial sequences (e.g. SP-2026-09-001) without manual data re-entry."),
        
        ("📊 Real-Time Google Sheets Auto-Sync",
         "Features built-in cloud auto-sync with Google Sheets. All renewals, passenger details, route assignments, and payment statuses sync live to management cloud spreadsheets, offering remote tracking from mobile or desktop anytime."),
        
        ("🖨️ Thermal & ID Card Batch Printing",
         "Includes formatted print cards featuring resident photo ID, CNIC number, designated route, vehicle assignment, issue/expiry dates, and auto-generated verification serials. Ready for batch thermal printing or plastic ID card production."),
        
        ("💾 Offline & Online Hybrid Database (IndexedDB)",
         "Operates smoothly even during internet disconnections or server outages. Data is saved locally in high-speed IndexedDB browser database storage and automatically syncs to cloud storage once connectivity is restored. Zero downtime guarantee."),
        
        ("👥 Member Directory & Route Management",
         "Comprehensive passenger profiles with CNIC, emergency contact numbers, designated shuttle route, pickup points, vehicle numbers, and attached member photo repository for conductor verification."),
        
        ("📥 Excel & JSON Data Migration",
         "Instant 1-click import functionality for existing Excel sheets (.xlsx, .csv) and JSON database dumps. Enables seamless onboarding of August and historical member lists without retyping."),
        
        ("🛡️ Tamper-Proof Audit Control & Security",
         "Auto-generated unique serial numbers and standardized formatting prevent counterfeit passes and un-renewed ridership, directly eliminating revenue loss for Commander City.")
    ]

    for title, desc in features:
        feat_p = f"""
        <w:p>
            <w:pPr><w:spacing w:before="60" w:after="100"/><w:ind w:left="280"/></w:pPr>
            <w:r>
                <w:rPr><w:b/><w:color w:val="0E7490"/></w:rPr>
                <w:t>• {title}: </w:t>
            </w:r>
            <w:r>
                <w:t>{desc}</w:t>
            </w:r>
        </w:p>
        """
        doc_xml_body.append(feat_p)

    # 5. Section 3: Commercial Proposal & 10K Membership Plan
    sec3 = """
    <w:p>
        <w:pPr><w:spacing w:before="320" w:after="140"/></w:pPr>
        <w:r>
            <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="28"/><w:color w:val="1E3A8A"/></w:rPr>
            <w:t>3. Commercial Proposal &amp; Monthly Membership Breakdown</w:t>
        </w:r>
    </w:p>
    <w:p>
        <w:pPr><w:spacing w:after="140"/></w:pPr>
        <w:r>
            <w:t>To maintain uninterrupted system operations, cloud synchronization, dedicated server backups, and continuous feature enhancements, we propose an all-inclusive </w:t>
        </w:r>
        <w:r>
            <w:rPr><w:b/><w:color w:val="D97706"/></w:rPr>
            <w:t>PKR 10,000 / Month Enterprise Membership &amp; Maintenance Plan</w:t>
        </w:r>
        <w:r>
            <w:t> covering up to 10,000 active member passes.</w:t>
        </w:r>
    </w:p>

    <!-- Pricing Table -->
    <w:tbl>
        <w:tblPr>
            <w:tblW w:w="9600" w:type="dxa"/>
            <w:tblJustification w:val="center"/>
            <w:tblBorders>
                <w:top w:val="single" w:sz="8" w:space="0" w:color="1E3A8A"/>
                <w:bottom w:val="single" w:sz="8" w:space="0" w:color="1E3A8A"/>
                <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
                <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
            </w:tblBorders>
        </w:tblPr>
        <!-- Header -->
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4200" w:type="dxa"/><w:shd w:fill="1E3A8A"/><w:tcMar><w:top w:w="160" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Service Module / Description</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:fill="1E3A8A"/><w:tcMar><w:top w:w="160" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Scope &amp; Capacity</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:fill="1E3A8A"/><w:tcMar><w:top w:w="160" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Pricing (PKR)</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <!-- Row 1 -->
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4200" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Software Application License &amp; Full Portal Access</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:t>Up to 10,000 Active Members &amp; Unlimited Terminals</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="059669"/></w:rPr><w:t>INCLUDED</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <!-- Row 2 -->
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4200" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Google Sheets Live Auto-Sync &amp; Data Security</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:t>Continuous Real-Time Cloud Syncing &amp; Backups</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="059669"/></w:rPr><w:t>INCLUDED</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <!-- Row 3 -->
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4200" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Monthly Maintenance &amp; Technical Support Plan</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:t>Dedicated On-Call Support, Updates &amp; Bug Fixes</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:fill="F8FAFC"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="D97706"/></w:rPr><w:t>PKR 10,000 / Mo</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <!-- Total Row -->
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="7200" w:type="dxa"/><w:gridSpan w:val="2"/><w:shd w:fill="FEF3C7"/><w:tcMar><w:top w:w="160" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="1E3A8A"/></w:rPr><w:t>TOTAL RECURRING MONTHLY MEMBERSHIP FEE:</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:fill="FEF3C7"/><w:tcMar><w:top w:w="160" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="D97706"/></w:rPr><w:t>PKR 10,000 / Mo</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>
    """
    doc_xml_body.append(sec3)

    # What is Included callout
    inc_box = """
    <w:tbl>
        <w:tblPr>
            <w:tblW w:w="9600" w:type="dxa"/>
            <w:tblJustification w:val="center"/>
            <w:tblBorders>
                <w:top w:val="single" w:sz="6" w:space="0" w:color="3B82F6"/>
                <w:bottom w:val="single" w:sz="6" w:space="0" w:color="3B82F6"/>
                <w:left w:val="single" w:sz="18" w:space="0" w:color="1E3A8A"/>
                <w:right w:val="single" w:sz="6" w:space="0" w:color="3B82F6"/>
            </w:tblBorders>
        </w:tblPr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="9600" w:type="dxa"/><w:shd w:fill="EFF6FF"/><w:tcMar><w:top w:w="180" w:type="dxa"/><w:bottom w:w="180" w:type="dxa"/><w:left w:w="200" w:type="dxa"/><w:right w:w="200" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p>
                    <w:pPr><w:spacing w:after="100"/></w:pPr>
                    <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="1E3A8A"/></w:rPr><w:t>🎁 MONTHLY 10K MEMBERSHIP PACKAGE INCLUSIONS:</w:t></w:r>
                </w:p>
                <w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="200"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>✓ Unlimited Pass Operations: </w:t></w:r><w:r><w:t>No per-pass, per-member, or usage limits for up to 10,000 active residents.</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="200"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>✓ Google Cloud Infrastructure: </w:t></w:r><w:r><w:t>Automated 24/7 Google Sheets cloud synchronization &amp; data backup monitoring.</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="200"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>✓ Feature Enhancements: </w:t></w:r><w:r><w:t>Regular software updates, print layout tuning, and custom feature additions.</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="0"/><w:ind w:left="200"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>✓ Priority Technical Support: </w:t></w:r><w:r><w:t>Dedicated hotline &amp; emergency resolution within 2 hours.</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:spacing w:after="240"/></w:pPr></w:p>
    """
    doc_xml_body.append(inc_box)

    # 6. Section 4: Approval & Sign-Off Request
    sec4 = """
    <w:p>
        <w:pPr><w:spacing w:before="320" w:after="140"/></w:pPr>
        <w:r>
            <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="28"/><w:color w:val="1E3A8A"/></w:rPr>
            <w:t>4. Formal Approval &amp; Authorization Request</w:t>
        </w:r>
    </w:p>
    <w:p>
        <w:pPr><w:spacing w:after="160"/></w:pPr>
        <w:r>
            <w:t>Management approval is hereby formally requested to authorize the software deployment and sanction the recurring </w:t>
        </w:r>
        <w:r>
            <w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr>
            <w:t>PKR 10,000 / Month Membership Fee</w:t>
        </w:r>
        <w:r>
            <w:t> for continuous system access and transport operations across Commander City.</w:t>
        </w:r>
    </w:p>

    <!-- Approval Details Table -->
    <w:tbl>
        <w:tblPr>
            <w:tblW w:w="9600" w:type="dxa"/>
            <w:tblJustification w:val="center"/>
            <w:tblBorders>
                <w:top w:val="single" w:sz="8" w:space="0" w:color="1E3A8A"/>
                <w:bottom w:val="single" w:sz="8" w:space="0" w:color="1E3A8A"/>
                <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
            </w:tblBorders>
        </w:tblPr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="3800" w:type="dxa"/><w:shd w:fill="1E3A8A"/><w:tcMar><w:top w:w="160" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Approval Parameter</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="5800" w:type="dxa"/><w:shd w:fill="1E3A8A"/><w:tcMar><w:top w:w="160" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Authorization Details</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="3800" w:type="dxa"/><w:shd w:fill="F1F5F9"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Approval Action Status:</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="5800" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="D97706"/></w:rPr><w:t>[  ] APPROVED        [  ] APPROVED WITH AMENDMENTS        [  ] REJECTED</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="3800" w:type="dxa"/><w:shd w:fill="F1F5F9"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Sanctioned Monthly Budget:</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="5800" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>PKR 10,000 / Month (Rupees Ten Thousand Only)</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="3800" w:type="dxa"/><w:shd w:fill="F1F5F9"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Authorized Approver Name:</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="5800" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:t>__________________________________________________________________</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="3800" w:type="dxa"/><w:shd w:fill="F1F5F9"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Designation / Department:</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="5800" w:type="dxa"/><w:shd w:fill="FFFFFF"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:r><w:t>__________________________________________________________________</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:spacing w:after="300"/></w:pPr></w:p>

    <!-- Signatures -->
    <w:tbl>
        <w:tblPr>
            <w:tblW w:w="9600" w:type="dxa"/>
            <w:tblJustification w:val="center"/>
            <w:tblBorders>
                <w:top w:val="none"/><w:bottom w:val="none"/><w:left w:val="none"/><w:right w:val="none"/>
                <w:insideH w:val="none"/><w:insideV w:val="none"/>
            </w:tblBorders>
        </w:tblPr>
        <w:tr>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Submitted By:</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:t>Signature: ___________________________</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Systems Lead / IT Administrator</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:t>Commander City Transport Dept.</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
                <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>
                <w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>Approved &amp; Sanctioned By:</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:t>Signature: ___________________________</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>General Manager / Director Finance</w:t></w:r></w:p>
                <w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:t>Commander City Executive Board</w:t></w:r></w:p>
            </w:tc>
        </w:tr>
    </w:tbl>
    """
    doc_xml_body.append(sec4)

    # Document end
    doc_xml_end = """
</w:body>
</w:document>"""

    full_doc_xml = doc_xml_start + "".join(doc_xml_body) + doc_xml_end

    # Write ZIP contents
    targets = [
        r"e:\SHUTTLE PASS PAYMENTS\QUOTATION.docx",
        r"e:\SHUTTLE PASS PAYMENTS\shuttle-pass-system\QUOTATION.docx",
        r"e:\SHUTTLE PASS PAYMENTS\shuttle-pass-system\QUOTATION_Commander_City_Shuttle_Pass_System.docx"
    ]

    for target in targets:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", content_types_xml)
            zf.writestr("_rels/.rels", rels_xml)
            zf.writestr("word/_rels/document.xml.rels", doc_rels_xml)
            zf.writestr("word/styles.xml", styles_xml)
            zf.writestr("word/document.xml", full_doc_xml)
        print(f"Successfully generated DOCX file at: {target}")

if __name__ == "__main__":
    build_word_document()
