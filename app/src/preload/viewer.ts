/**
 * Preload da janela de quem assiste uma sessao pelo app. A pagina vem do PC de outra pessoa,
 * entao so ganha uma coisa: pedir pra propria janela flutuar (pequena e sempre por cima).
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('callSketchViewer', {
  setFloating: (on: boolean): Promise<boolean> => ipcRenderer.invoke('viewer:float', on === true),
})
