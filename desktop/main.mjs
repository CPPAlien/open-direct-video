import { app, BrowserWindow, Menu, dialog, session, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

app.setName('OpenDirect');
app.setAppUserModelId('org.opendirect.studio');

const sourceUrl = 'https://github.com/CPPAlien/open-direct-video';
let window;
let address;

function openWindow() {
  window = new BrowserWindow({
    width: 1390, height: 880, minWidth: 690, minHeight: 620,
    show: false, title: 'OpenDirect', backgroundColor: '#181a1b',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== address + '/') event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === sourceUrl || url === sourceUrl + '/') void shell.openExternal(sourceUrl);
    return { action: 'deny' };
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; });
  void window.loadURL(address + '/').catch(error => {
    dialog.showErrorBox('OpenDirect 无法载入工作台', error.message);
    app.quit();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.whenReady().then(async () => {
    if (!app.isPackaged) {
      try { process.loadEnvFile(join(app.getAppPath(), '.env')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    process.env.OPENDIRECT_DATA ||= app.getPath('userData');
    process.env.PORT = '0';
    process.env.OPENDIRECT_DESKTOP = randomUUID();
    const { address: localAddress } = await import('../server/index.mjs');
    address = localAddress;
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, done) => done(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [address + '/*'] }, (details, done) => {
      done({ requestHeaders: { ...details.requestHeaders, 'X-OpenDirect-Desktop': process.env.OPENDIRECT_DESKTOP } });
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' },
        { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '视图', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: '帮助', submenu: [{ label: '打开项目目录', click: () => void shell.openPath(process.env.OPENDIRECT_DATA) },
        { label: '查看源码', click: () => void shell.openExternal(sourceUrl) }] },
    ]));
    openWindow();
    app.on('activate', () => { if (!window) openWindow(); });
  }).catch(error => { dialog.showErrorBox('OpenDirect 启动失败', error.message); app.quit(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
