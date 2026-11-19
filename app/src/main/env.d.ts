// arquivos importados com ?asset: o electron-vite copia para o build e devolve o caminho
declare module '*?asset' {
  const path: string
  export default path
}
