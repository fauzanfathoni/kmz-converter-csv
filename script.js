// --- script.js ---
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const uploadText = document.getElementById('upload-text');
const convertBtn = document.querySelector('.convert-btn');
const previewContainer = document.getElementById('preview-table');

let selectedFile = null;
let parsedData = null;

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  uploadText.innerHTML = `<strong>Convert :</strong> ${file.name}`;

  if (file.name.endsWith('.kmz')) {
    JSZip.loadAsync(file).then(zip => {
      const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
      if (kmlFile) {
        return kmlFile.async('text');
      } else {
        alert('KML not found in KMZ.');
      }
    }).then(kmlText => {
      if (kmlText) parseKML(kmlText);
    });
  } else if (file.name.endsWith('.kml')) {
    file.text().then(kmlText => parseKML(kmlText));
  } else {
    alert('Unsupported file format');
  }
}

function parseKML(kmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, "text/xml");
  const placemarks = xml.getElementsByTagNameNS("http://www.opengis.net/kml/2.2", "Placemark");
  let rows = [];
  let headersSet = new Set();

  let fatToPoleMap = new Map();

  for (let placemark of placemarks) {
    const simpleDataElems = placemark.getElementsByTagNameNS("http://www.opengis.net/kml/2.2", "SimpleData");
    let fatId = '', poleId = '';
    for (let el of simpleDataElems) {
      const key = el.getAttribute("name");
      const val = el.textContent.trim();
      if (key === "FAT_ID_NETWORK_ID") fatId = val;
      if (key === "Pole_ID__New_") poleId = val;
    }
    if (fatId && poleId) {
      fatToPoleMap.set(fatId, poleId);
    }
  }

  for (let placemark of placemarks) {
    const coordText = placemark.getElementsByTagNameNS("http://www.opengis.net/kml/2.2", "coordinates")[0]?.textContent.trim() || '';
    const [lonRaw, latRaw] = coordText.split(',').map(v => v.trim());
    const lat = latRaw ? parseFloat(latRaw).toFixed(6) : '';
    const lon = lonRaw ? parseFloat(lonRaw).toFixed(6) : '';

    let rowData = {};
    rowData.Latitude = lat;
    rowData.Longitude = lon;

    const simpleDataElems = placemark.getElementsByTagNameNS("http://www.opengis.net/kml/2.2", "SimpleData");
    for (let el of simpleDataElems) {
      const key = el.getAttribute("name");
      if (["HPTAR_ID", "OBJECTID", "Shape_Length", "Shape_Area"].includes(key)) continue;
      const value = el.textContent.trim();
      rowData[key] = value;
      headersSet.add(key);
    }

    const descriptionNode = placemark.getElementsByTagNameNS("http://www.opengis.net/kml/2.2", "description")[0];
    if (descriptionNode && descriptionNode.textContent.includes('<td>')) {
      const descDoc = new DOMParser().parseFromString(descriptionNode.textContent, 'text/html');
      const tds = descDoc.querySelectorAll('td');
      for (let i = 0; i < tds.length - 1; i += 2) {
        const key = tds[i].textContent.trim();
        const value = tds[i + 1].textContent.trim();
        if (["HPTAR_ID", "OBJECTID", "Shape_Length", "Shape_Area"].includes(key)) continue;
        rowData[key] = value;
        headersSet.add(key);
      }
    }

    const fatCode = rowData["FAT_CODE"] || '';
    const poleFat = fatToPoleMap.get(fatCode) || '';
    rowData["POLE_FAT"] = poleFat;
    headersSet.add("POLE_FAT");

    rows.push(rowData);
  }

  let headers = Array.from(headersSet);
  const fatIdx = headers.indexOf("FAT_CODE");
  if (fatIdx !== -1) {
    headers.splice(fatIdx + 1, 0, "POLE_FAT");
  }
  headers = headers.filter(h => !["Name", "Latitude", "Longitude"].includes(h));
  parsedData = { headers, rows };
  showCSVPreview(headers, rows);
}

function showCSVPreview(headers, rows) {
  let html = `<div style="max-height:400px;width:100%;overflow:auto;margin-top:10px"><table style="border-collapse:collapse;width:100%;font-size:0.8rem"><thead><tr>${headers.map(h => `<th style='border:1px solid #ccc;padding:4px;background:#eee'>${h}</th>`).join('')}</tr></thead><tbody>`;
  for (let r of rows) {
    html += `<tr>${headers.map(h => `<td style='border:1px solid #ccc;padding:4px'>${r[h] || ''}</td>`).join('')}</tr>`;
  }
  html += `</tbody></table></div>`;
  previewContainer.innerHTML = html;
}

convertBtn.addEventListener('click', () => {
  if (!parsedData) return alert('No data to convert. Please upload a valid KML/KMZ file first.');
  const { headers, rows } = parsedData;
  const csvContent = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      let val = r[h] || '';
      if (!isNaN(val) && val.includes('.')) {
        const num = parseFloat(val);
        if (!isNaN(num)) val = num.toFixed(6);
      }
      return `"${val.replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${selectedFile.name.replace(/\.[^/.]+$/, '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});