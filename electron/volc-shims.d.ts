// ali-oss 未随包提供类型声明，这里给出最小声明（仅按 any 使用，运行时依赖真实包）。
declare module 'ali-oss' {
  const OSS: any;
  export default OSS;
}
