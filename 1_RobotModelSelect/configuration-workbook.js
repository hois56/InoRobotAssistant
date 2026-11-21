(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.InoRobotConfigurationWorkbook = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    const columns = [
        {label: '순번', width: 10, format: 'number'},
        {label: '형번', width: 33, format: 'text'},
        {label: '코드', width: 23, format: 'code'},
        {label: '타입', width: 19, format: 'text'},
        {label: '상세 정보', width: 50, format: 'text'},
        {label: '수량', width: 17, format: 'quantity'},
        {label: '품목 구분', width: 21, format: 'text'}
    ];
    const headerRow = 4;
    const firstItemRow = headerRow + 1;
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const sheetNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const officeRels = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const packageNamespace = 'http://schemas.openxmlformats.org/package/2006';

    function createReport(rows, translate, configurationCount) {
        const roles = {robot: translate('본체 (필수)'), cable: translate('케이블 (필수)'), option: translate('선택 옵션')};
        const robots = rows.filter(row => row.kind === 'robot');
        const groups = [];
        const byCode = new Map();
        for (const row of rows) {
            const code = String(row.code ?? '').trim();
            const hasCode = code && !/^(?:[-–—]+|N\/?A)$/i.test(code);
            let group = hasCode && byCode.get(code);
            if (!group) {
                group = [];
                groups.push(group);
                if (hasCode) byCode.set(code, group);
            }
            group.push(row);
        }
        const roleOrder = Object.keys(roles);
        let mixedRobotQuantity = 0;
        const items = groups.map(group => {
            const byKind = new Map();
            for (const row of group) byKind.set(row.kind, (byKind.get(row.kind) || 0) + row.quantity);
            const kinds = roleOrder.filter(kind => byKind.has(kind));
            const quantity = group.reduce((sum, row) => sum + row.quantity, 0);
            const field = key => [...new Set(group.map(row => row[key]).filter(Boolean))].join('\n');
            const role = kinds.length === 1 ? roles[kinds[0]]
                : kinds.map(kind => `${roles[kind]} × ${byKind.get(kind)}`).join('\n');
            if (kinds.length > 1) mixedRobotQuantity += byKind.get('robot') || 0;
            return {kind: kinds[0], cells: [field('modelNumber'), String(group[0].code ?? '').trim(), field('type'), field('details'), quantity, role]};
        }).sort((a, b) => roleOrder.indexOf(a.kind) - roleOrder.indexOf(b.kind));
        return {
            title: translate('Inovance 로봇 구성서'),
            sheetName: translate('구성 목록'),
            configurationLabel: translate('총 구성 수'),
            quantityLabel: translate('총 로봇 수량'),
            configurationCount: configurationCount ?? robots.length,
            robotQuantity: robots.reduce((sum, row) => sum + row.quantity, 0),
            robotRole: roles.robot,
            mixedRobotQuantity,
            columns: columns.map(column => ({...column, label: translate(column.label)})),
            rows: items.map(({kind, cells}, index) => ({kind, values: [index + 1, ...cells]}))
        };
    }

    function xml(value) {
        return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
    }

    function cell(ref, style, value, formula) {
        if (typeof value === 'number') {
            const calculation = formula ? `<f>${xml(formula)}</f>` : '';
            return `<c r="${ref}" s="${style}">${calculation}<v>${value}</v></c>`;
        }
        return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }

    function rowXml(index, height, cells) {
        return `<row r="${index}" ht="${height}" customHeight="1">${cells.join('')}</row>`;
    }

    // Excel column widths use digits as units. Allow for wider CJK glyphs and wrapping at word boundaries.
    function wrappedLines(value, width) {
        let lines = 0;
        for (const paragraph of String(value ?? '').split(/\r\n?|\n/)) {
            let used = 0;
            lines++;
            for (const word of paragraph.split(/\s+/)) {
                const length = Array.from(word).reduce((n, ch) => n + (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff01-\uff60]/u.test(ch) ? 2 : 1), 0);
                if (used && used + 1 + length > width) {
                    lines++;
                    used = 0;
                }
                const advance = used + (used ? 1 : 0) + length;
                lines += Math.max(0, Math.ceil(advance / width) - 1);
                used = advance ? (advance - 1) % width + 1 : 0;
            }
        }
        return lines;
    }

    function rowHeight(values, minHeight, margin) {
        const lines = Math.max(...values.map((value, i) => wrappedLines(value, columns[i].width - margin)));
        return Math.min(409, Math.max(minHeight, 16 * lines + 9));
    }

    function makeStyles() {
        const fonts = [
            [11, '243746'], [17, 'FFFFFF', true], [10, 'DAE8F0'], [16, 'FFFFFF', true],
            [11, 'FFFFFF', true], [11, '114C70', true], [11, '153B55', true]
        ].map(([size, color, bold]) => `<font>${bold ? '<b/>' : ''}<sz val="${size}"/><color rgb="FF${color}"/><name val="Malgun Gothic"/><family val="2"/></font>`);
        const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
            ...['192F42', '075E94', 'DCEFFC', 'EFF6FA', 'F5F8FA', 'FFFFFF'].map(color =>
                `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`)];
        function border(top, bottom) {
            const edge = (side, color) => color ? `<${side} style="thin"><color rgb="FF${color}"/></${side}>` : `<${side}/>`;
            return `<border><left/><right/>${edge('top', top)}${edge('bottom', bottom)}<diagonal/></border>`;
        }
        const borders = [border(), border(null, 'D9E4EB'), border('8DB7CE', 'AECCDD')];
        const xfs = [];
        function style(font, fill, borderId, align, numFmt = 0) {
            const alignment = align ? `<alignment horizontal="${align}" vertical="center"${align === 'center' ? '' : ' indent="1"'} wrapText="1"/>` : '';
            xfs.push(`<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1">${alignment}</xf>`);
            return xfs.length - 1;
        }
        style(0, 0, 0);
        const ids = {
            title: style(1, 2, 0, 'left'), label: style(2, 2, 0, 'right'), count: style(3, 2, 0, 'center', 3),
            header: style(4, 3, 0, 'left'), numericHeader: style(4, 3, 0, 'center')
        };
        function body(font, fill, borderId) {
            return {
                text: style(font, fill, borderId, 'left'), code: style(font, fill, borderId, 'left', 49),
                number: style(font, fill, borderId, 'center', 3), quantity: style(font || 6, fill, borderId, 'right', 3)
            };
        }
        ids.robot = body(5, 4, 2);
        ids.cable = body(0, 5, 1);
        ids.option = body(0, 7, 1);
        ids.stripe = body(0, 6, 1);
        const stylesXml = xmlHeader + `<styleSheet xmlns="${sheetNamespace}"><fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
            `<fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>` +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
        return {ids, stylesXml};
    }

    function buildFiles(report) {
        const {ids, stylesXml} = makeStyles();
        const last = headerRow + report.rows.length;
        const columnLetter = i => String.fromCharCode(65 + i);
        const headerLabels = report.columns.map(column => column.label);
        const roleRange = `$G$${firstItemRow}:$G$${Math.max(firstItemRow, last)}`;
        const quantityRange = `$F$${firstItemRow}:$F$${Math.max(firstItemRow, last)}`;
        const robotCriterion = '"' + report.robotRole.replaceAll('"', '""') + '"';
        const robotFormula = `SUMIF(${roleRange},${robotCriterion},${quantityRange})` +
            (report.mixedRobotQuantity ? '+' + report.mixedRobotQuantity : '');
        const summaryHeight = Math.max(39, 15 * Math.max(wrappedLines(report.configurationLabel, columns[3].width - 3),
            wrappedLines(report.quantityLabel, columns[5].width - 3)) + 9);
        const rows = [
            rowXml(1, 7, []),
            rowXml(2, summaryHeight, [
                cell('A2', ids.title, report.title),
                cell('D2', ids.label, report.configurationLabel),
                cell('E2', ids.count, report.configurationCount),
                cell('F2', ids.label, report.quantityLabel),
                cell('G2', ids.count, report.robotQuantity, robotFormula)
            ]),
            rowXml(3, 6, []),
            rowXml(headerRow, rowHeight(headerLabels, 30, 5), headerLabels.map((label, i) => {
                const headerStyle = ['number', 'quantity'].includes(columns[i].format) ? ids.numericHeader : ids.header;
                return cell(columnLetter(i) + headerRow, headerStyle, label);
            }))
        ];
        report.rows.forEach(({kind, values}, i) => {
            const n = firstItemRow + i;
            const bodyStyle = kind === 'option' && i % 2 ? ids.stripe : ids[kind];
            const cells = values.map((value, j) => cell(columnLetter(j) + n, bodyStyle[columns[j].format], value));
            rows.push(rowXml(n, rowHeight(values, kind === 'robot' ? 30 : 26, 4), cells));
        });
        const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('');
        const worksheet = xmlHeader + `<worksheet xmlns="${sheetNamespace}"><sheetPr><tabColor rgb="FF075E94"/><pageSetUpPr fitToPage="1"/></sheetPr>` +
            `<dimension ref="A1:G${last}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${firstItemRow}" activePane="bottomLeft" state="frozen"/>` +
            `<selection pane="bottomLeft" activeCell="A${firstItemRow}" sqref="A${firstItemRow}"/></sheetView></sheetViews>` +
            `<sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>` +
            `<autoFilter ref="A${headerRow}:G${last}"/><mergeCells count="1"><mergeCell ref="A2:C2"/></mergeCells>` +
            '<printOptions horizontalCentered="1"/><pageMargins left="0.28" right="0.28" top="0.4" bottom="0.45" header="0.2" footer="0.2"/>' +
            '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;R&amp;P / &amp;N</oddFooter></headerFooter></worksheet>';
        const sheetRef = xml("'" + report.sheetName.replaceAll("'", "''") + "'!");
        const workbook = xmlHeader + `<workbook xmlns="${sheetNamespace}" xmlns:r="${officeRels}"><sheets><sheet name="${xml(report.sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
            `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">${sheetRef}$${headerRow}:$${headerRow}</definedName>` +
            `<definedName name="_xlnm.Print_Area" localSheetId="0">${sheetRef}$A$1:$G$${last}</definedName></definedNames></workbook>`;
        const relationships = parts => xmlHeader + `<Relationships xmlns="${packageNamespace}/relationships">` + parts.map(([type, target], i) =>
            `<Relationship Id="rId${i + 1}" Type="${officeRels}/${type}" Target="${target}"/>`).join('') + '</Relationships>';
        const contentTypes = xmlHeader + `<Types xmlns="${packageNamespace}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
        return {
            '[Content_Types].xml': contentTypes,
            '_rels/.rels': relationships([['officeDocument', 'xl/workbook.xml']]),
            'xl/workbook.xml': workbook,
            'xl/_rels/workbook.xml.rels': relationships([['worksheet', 'worksheets/sheet1.xml'], ['styles', 'styles.xml']]),
            'xl/worksheets/sheet1.xml': worksheet,
            'xl/styles.xml': stylesXml
        };
    }

    return {createReport, buildFiles};
});
