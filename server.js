// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');

const CONFIG_PATH = path.join(__dirname, 'configs', 'map.conf');
const SAVE_PATH = path.join(__dirname, 'configs', 'map.conf.new');
const CONFIG_DIR = path.join(__dirname, 'configs');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
//app.use(express.json());
app.use(express.json({limit: "100mb", extended: true}));

function parseWeathermapConfig(text) {
  const lines = text.split(/\r?\n/);
  const result = { sets: {}, nodes: {}, links: {}, globals: [] };

  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.type === 'NODE') result.nodes[current.name] = current.props;
    if (current.type === 'LINK') result.links[current.name] = current.props;
    current = null;
  };

  for (let raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const mSet = line.match(/^SET\s+(\S+)\s+(.*)$/i);
    if (mSet) {
      result.sets[mSet[1]] = mSet[2];
      continue;
    }

    const mBlock = line.match(/^(NODE|LINK)\s+(.+)$/i);
    if (mBlock) {
      pushCurrent();
      current = { type: mBlock[1].toUpperCase(), name: mBlock[2].trim(), props: {} };
      continue;
    }

    const mInlineLink = line.match(/^LINK\s+(\S+)\s+(\S+)\s+(\S+)$/i);
    if (mInlineLink) {
      const name = mInlineLink[1];
      result.links[name] = { endpoint_a: mInlineLink[2], endpoint_b: mInlineLink[3] };
      continue;
    }

    const mKV = line.match(/^([A-Z0-9_]+)\s+(.*)$/i);
    if (mKV && current) {
      const key = mKV[1].toUpperCase();
      const val = mKV[2].trim();

      if (key === 'POSITION') {
        const p = val.split(/\s+/).map(x => parseInt(x, 10));
        current.props.position = { x: p[0] || 0, y: p[1] || 0 };
        continue;
      }

      if (key === 'LABEL') {
        current.props.label = val.replace(/^"(.*)"$/, '$1');
        continue;
      }

      if (/^(WIDTH|HEIGHT|LINKWIDTH|LINEWIDTH|ARROW)$/.test(key)) {
        const n = Number(val);
        current.props[key.toLowerCase()] = isNaN(n) ? val : n;
        continue;
      }

      if (key === 'TARGET') {
        current.props.target = current.props.target || [];
        current.props.target.push(val);
        continue;
      }
    
      if (key === 'VIA') {
        const coords = val.split(/\s+/).map(Number);
        if (!current.props.vias) current.props.vias = [];
        if (coords.length >= 2) {
            current.props.vias.push({ x: coords[0], y: coords[1] });
        }
        continue;
      }
      if (key === 'NODES') {
        const nodes = val.split(/\s+/).map(String);
            current.props.endpoint_a = nodes[0].split(':');
            current.props.endpoint_b = nodes[1].split(':');
        continue;
      }
      current.props[key.toLowerCase()] = val.replace(/^"(.*)"$/, '$1');
      continue;
    }

    const mDirective = line.match(/^([A-Z]+)\s*(.*)$/i);
    if (mDirective) {
      result.globals.push({ key: mDirective[1].toUpperCase(), value: mDirective[2].trim() });
      continue;
    }
  }

  pushCurrent();
  return result;
}

// Convert parsed object back to config file format
function toWeathermapConfig(obj) {
  let out = [];

  // globals / sets
  for (let [k, v] of Object.entries(obj.sets || {})) {
    out.push(`SET ${k} ${v}`);
  }
  for (let g of obj.globals || []) {
    out.push(`${g.key} ${g.value}`);
  }
  // nodes
  for (let [name, props] of Object.entries(obj.nodes || {})) {
    out.push(`NODE ${name}`);

    if (props.label) {
      out.push(`  LABEL ${props.label}`);
    }
    if (props.width) out.push(`  WIDTH ${props.width}`);
    if (props.height) out.push(`  HEIGHT ${props.height}`);
    for (let [k, v] of Object.entries(props)) {
      if (['position', 'label', 'width', 'height'].includes(k)) continue;
      if (Array.isArray(v)) {
        v.forEach(val => out.push(`  ${k.toUpperCase()} ${val}`));
      } else {
        out.push(`  ${k.toUpperCase()} ${v}`);
      }
    }
    if (props.position) {
      out.push(`  POSITION ${props.position.x} ${props.position.y}`);
    }
    out.push('');
  }

  // links
  for (let [name, props] of Object.entries(obj.links || {})) {
    out.push(`LINK ${name}`);
    if (props.endpoint_a && props.endpoint_b) {
      endp_a_offset = props.endpoint_a[1] ? `:${props.endpoint_a[1]}` : "";
      endp_b_offset = props.endpoint_b[1] ? `:${props.endpoint_b[1]}` : "";

      out.push(`  NODES ${props.endpoint_a[0]}${endp_a_offset} ${props.endpoint_b[0]}${endp_b_offset}`);
    }
    if (props.linkwidth) out.push(`  LINKWIDTH ${props.linkwidth}`);
    for (let [k, v] of Object.entries(props)) {
      if (['endpoint_a', 'endpoint_b', 'linkwidth'].includes(k)) continue;
      if (k === 'vias' && Array.isArray(v)) {
        v.forEach(via => out.push(`  VIA ${via.x} ${via.y}`));
        continue;
      }
      if (Array.isArray(v)) {
        v.forEach(val => out.push(`  ${k.toUpperCase()} ${val}`));
      } else {
        out.push(`  ${k.toUpperCase()} ${v}`);
      }
    }
    out.push('');
  }

  return out.join('\n');
}

app.get('/map.json', (req, res) => {
  fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Cannot read config: ' + err.message });
    try {
      const parsed = parseWeathermapConfig(data);
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: 'Parse error: ' + e.message });
    }
  });
});

app.get('/load-config', (req, res) => {
  const file = req.query.file;
  if (!file || file.includes('/') || file.includes('..')) {
    return res.status(400).json({ error: 'Invalid file name' });
  }
  const filePath = path.join(CONFIG_DIR, file);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Cannot read config file' });
    try {
      const parsed = parseWeathermapConfig(data);
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: 'Parse error: ' + e.message });
    }
  });
});

// Save updated config
app.post('/save', (req, res) => {
  try {
    const updated = req.body;
    const text = toWeathermapConfig(updated);
    fs.writeFile(SAVE_PATH, text, 'utf8', (err) => {
      if (err) return res.status(500).json({ error: 'Cannot save: ' + err.message });
      res.json({ status: 'ok' });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve static files from public directory (for nodes icons)
app.use('/images', express.static(path.join(__dirname, 'images')));

app.get('/config-files', (req, res) => {
  fs.readdir(CONFIG_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Cannot list config files' });
    // Optionally filter for .conf files
    const confFiles = files; //.filter(f => f.endsWith('.conf'));
    res.json(confFiles);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));