// index.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 配置
const FILE_PATH = path.resolve(__dirname, 'tmp');
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const DOWNLOAD_URL = process.env.DOWNLOAD_WEB || 'http://fi10.bot-hosting.net:20980/web';
const BACKUP_URL = (process.env.DOWNLOAD_WEB_BACKUP || 'https://amd64.ssss.nyc.mn/web').trim();

const getOrCreateUUID = () => {
  const uuidFile = path.join(__dirname, '.uuid');
  try {
    return fs.readFileSync(uuidFile, 'utf-8').trim();
  } catch {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    fs.writeFileSync(uuidFile, uuid);
    return uuid;
  }
};

const cleanup = () => {
  if (fs.existsSync(FILE_PATH)) {
    fs.rmSync(FILE_PATH, { recursive: true, force: true });
  }
};

const setup = (uuid) => {
  if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

  const config = {
    log: { access: 'none', error: 'none', loglevel: 'none' },
    inbounds: [
      {
        port: PORT,
        protocol: 'vless',
        settings: {
          clients: [{ id: uuid }],
          decryption: 'none',
          fallbacks: [
            { dest: 3001 },
            { path: "/hello", dest: 3000 },
            { path: "/vless", dest: 3002 }
          ]
        }
      },
      {
        port: 3001,
        listen: "127.0.0.1",
        protocol: "vless",
        settings: { clients: [{ id: uuid }], decryption: "none" },
        streamSettings: { network: "xhttp", xhttpSettings: { path: "/xh" } }
      },
      {
        port: 3002,
        listen: "127.0.0.1",
        protocol: "vless",
        settings: { clients: [{ id: uuid }], decryption: "none" },
        streamSettings: { network: "ws", wsSettings: { path: "/vless" } }
      }
    ],
    dns: {
      servers: ["https+local://1.1.1.1/dns-query"],
      disableCache: true
    },
    outbounds: [
      { protocol: "freedom", tag: "direct" },
      { protocol: "blackhole", tag: "block" }
    ]
  };

  const configPath = path.join(FILE_PATH, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
};

const downloadFile = (url, filePath) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    const req = (url.startsWith('https') ? https : http).get(url, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(reject(new Error('Timeout'))));
  });
};

const startService = async () => {
  cleanup();

  const uuid = getOrCreateUUID();
  const configPath = setup(uuid);
  const webPath = path.join(FILE_PATH, 'web');

  try {
    await downloadFile(DOWNLOAD_URL, webPath);
  } catch {
    try {
      await downloadFile(BACKUP_URL, webPath);
    } catch {
      console.error('❌ 下载失败：主备 URL 均不可用');
      process.exit(1);
    }
  }

  try {
    fs.chmodSync(webPath, 0o755);
    const webProcess = spawn(webPath, ['-c', configPath], {
      stdio: 'ignore',
      detached: true
    });
    webProcess.unref();
  } catch (err) {
    console.error('❌ 启动失败:', err.message);
    process.exit(1);
  }
  setTimeout(cleanup, 90 * 1000);
    
  setInterval(() => {
    console.log(`💗 心跳 | 服务正常运行中 `);
  }, 5 * 60 * 1000); 
    
  console.log(`🚀 服务运行中 | UUID: ${uuid} | Port: ${PORT}`);
};

http.createServer((req, res) => res.end('hello')).listen(3000);

startService();
