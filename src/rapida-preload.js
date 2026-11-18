// Puente mínimo de la ventana de captura rápida
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rapida', {
  asignaturas: () => ipcRenderer.invoke('rapida:asignaturas'),
  guardar: (d) => ipcRenderer.invoke('rapida:guardar', d),
  cerrar: () => ipcRenderer.send('rapida:cerrar'),
});
