import type { JaygoAPI } from '../types';

// 渲染层统一通过 window.JaygoAPI 与主进程通信
export const api: JaygoAPI = window.JaygoAPI;
