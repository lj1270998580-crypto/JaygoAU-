export interface OfficialVoice {
  id: string;          // voice_type
  name: string;        // 中文显示名
  gender?: '男' | '女';
  tag?: string;        // 语言/特色标签
}

export const OFFICIAL_VOICES: OfficialVoice[] = [
  // === 通用女声 ===
  { id: 'zh_female_cancan_mars_bigtts', name: '灿灿', gender: '女', tag: '中/英' },
  { id: 'zh_female_qinqienvsheng_moon_bigtts', name: '亲切女声', gender: '女' },
  { id: 'zh_female_shuangkuaisisi_moon_bigtts', name: '爽快思思', gender: '女', tag: '中/英' },
  { id: 'zh_female_linjianvhai_moon_bigtts', name: '邻家女孩', gender: '女' },
  { id: 'zh_female_gaolengyujie_moon_bigtts', name: '高冷御姐', gender: '女' },
  { id: 'zh_female_meilinvyou_moon_bigtts', name: '魅力女友', gender: '女' },

  // === 通用男声 ===
  { id: 'zh_male_xudong_conversation_wvae_bigtts', name: '快乐小东', gender: '男' },
  { id: 'zh_male_wennuanahu_moon_bigtts', name: '温暖阿虎', gender: '男', tag: '中/英' },
  { id: 'zh_male_yangguangqingnian_moon_bigtts', name: '阳光青年', gender: '男' },
  { id: 'zh_male_yuanboxiaoshu_moon_bigtts', name: '渊博小叔', gender: '男' },
  { id: 'zh_male_aojiaobazong_moon_bigtts', name: '傲娇霸总', gender: '男' },
  { id: 'zh_male_shenyeboke_moon_bigtts', name: '深夜博客', gender: '男' },
  { id: 'zh_male_dongfanghaoran_moon_bigtts', name: '东方浩然', gender: '男' },

  // === 情感音色 ===
  { id: 'zh_male_lengkugege_emo_v2_mars_bigtts', name: '冷酷哥哥', gender: '男', tag: '情感' },
  { id: 'zh_female_tianxinxiaomei_emo_v2_mars_bigtts', name: '甜心小妹', gender: '女', tag: '情感' },
  { id: 'zh_female_gaolengyujie_emo_v2_mars_bigtts', name: '高冷御姐·情感', gender: '女', tag: '情感' },
  { id: 'zh_male_aojiaobazong_emo_v2_mars_bigtts', name: '傲娇霸总·情感', gender: '男', tag: '情感' },
  { id: 'zh_male_guangzhoudege_emo_mars_bigtts', name: '广州的哥', gender: '男', tag: '情感' },
  { id: 'zh_male_jingqiangkanye_emo_mars_bigtts', name: '京腔侃爷', gender: '男', tag: '情感' },
  { id: 'zh_female_linjuayi_emo_v2_mars_bigtts', name: '邻家阿姨', gender: '女', tag: '情感' },
  { id: 'zh_male_yourougongzi_emo_v2_mars_bigtts', name: '优柔公子', gender: '男', tag: '情感' },
  { id: 'zh_male_ruyayichen_emo_v2_mars_bigtts', name: '儒雅亦辰', gender: '男', tag: '情感' },
  { id: 'zh_male_junlangnanyou_emo_v2_mars_bigtts', name: '俊朗男友', gender: '男', tag: '情感' },
  { id: 'zh_male_beijingxiaoye_emo_v2_mars_bigtts', name: '北京小爷', gender: '男', tag: '情感' },
  { id: 'zh_female_roumeinvyou_emo_v2_mars_bigtts', name: '柔美女友', gender: '女', tag: '情感' },
  { id: 'zh_male_yangguangqingnian_emo_v2_mars_bigtts', name: '阳光青年·情感', gender: '男', tag: '情感' },
  { id: 'zh_female_meilinvyou_emo_v2_mars_bigtts', name: '魅力女友·情感', gender: '女', tag: '情感' },
  { id: 'zh_female_shuangkuaisisi_emo_v2_mars_bigtts', name: '爽快思思·情感', gender: '女', tag: '中/英' },
  { id: 'zh_male_shenyeboke_emo_v2_mars_bigtts', name: '深夜博客·情感', gender: '男', tag: '情感' },

  // === 英语情感 ===
  { id: 'en_female_candice_emo_v2_mars_bigtts', name: 'Candice', gender: '女', tag: '美式' },
  { id: 'en_female_skye_emo_v2_mars_bigtts', name: 'Serena', gender: '女', tag: '美式' },
  { id: 'en_male_glen_emo_v2_mars_bigtts', name: 'Glen', gender: '男', tag: '美式' },
  { id: 'en_male_sylus_emo_v2_mars_bigtts', name: 'Sylus', gender: '男', tag: '美式' },
  { id: 'en_male_corey_emo_v2_mars_bigtts', name: 'Corey', gender: '男', tag: '英式' },
  { id: 'en_female_nadia_tips_emo_v2_mars_bigtts', name: 'Nadia', gender: '女', tag: '英式' },

  // === 视频配音 ===
  { id: 'zh_male_M100_conversation_wvae_bigtts', name: '绅士', gender: '男' },
  { id: 'zh_female_maomao_conversation_wvae_bigtts', name: '乖巧毛毛', gender: '女' },
  { id: 'zh_male_tiancaitongsheng_mars_bigtts', name: '天才童声', gender: '男' },
  { id: 'zh_male_sunwukong_mars_bigtts', name: '猴哥', gender: '男' },
  { id: 'zh_male_xionger_mars_bigtts', name: '熊二', gender: '男' },
  { id: 'zh_female_peiqi_mars_bigtts', name: '佩奇猪', gender: '女' },
  { id: 'zh_female_wuzetian_mars_bigtts', name: '武则天', gender: '女' },
  { id: 'zh_female_yingtaowanzi_mars_bigtts', name: '樱桃丸子', gender: '女' },
  { id: 'zh_male_silang_mars_bigtts', name: '四郎', gender: '男' },
  { id: 'zh_male_jieshuonansheng_mars_bigtts', name: '解说男生', gender: '男', tag: '中/英' },

  // === 有声书 ===
  { id: 'zh_male_changtianyi_mars_bigtts', name: '长天一', gender: '男' },
  { id: 'zh_male_ruyaqingnian_mars_bigtts', name: '儒雅青年', gender: '男' },
  { id: 'zh_male_baqiqingshu_mars_bigtts', name: '霸气情叔', gender: '男' },
  { id: 'zh_male_qingcang_mars_bigtts', name: '青苍', gender: '男' },
  { id: 'zh_female_gufengshaoyu_mars_bigtts', name: '古风少女', gender: '女' },
  { id: 'zh_female_wenroushunv_mars_bigtts', name: '温柔淑女', gender: '女' },

  // === 多语言 ===
  { id: 'en_female_lauren_moon_bigtts', name: 'Lauren', gender: '女', tag: '美式' },
  { id: 'en_male_michael_moon_bigtts', name: 'Michael', gender: '男', tag: '美式' },
  { id: 'en_male_bruce_moon_bigtts', name: 'Bruce', gender: '男', tag: '美式' },
  { id: 'en_female_emily_mars_bigtts', name: 'Emily', gender: '女', tag: '英式' },
  { id: 'en_male_smith_mars_bigtts', name: 'Smith', gender: '男', tag: '英式' },
  { id: 'en_female_anna_mars_bigtts', name: 'Anna', gender: '女', tag: '英式' },

  // === 趣味方言 ===
  { id: 'zh_female_yueyunv_mars_bigtts', name: '粤语女', gender: '女', tag: '粤语' },
  { id: 'zh_male_yuzhouzixuan_moon_bigtts', name: '豫州子轩', gender: '男', tag: '河南' },
  { id: 'zh_female_daimengchuanmei_moon_bigtts', name: '呆萌川妹', gender: '女', tag: '四川' },
  { id: 'zh_male_guangxiyuanzhou_moon_bigtts', name: '广西远舟', gender: '男', tag: '广西' },
  { id: 'zh_male_zhoujielun_emo_v2_mars_bigtts', name: '双截棍哥', gender: '男', tag: '台湾' },
  { id: 'zh_female_wanwanxiaohe_moon_bigtts', name: '湾湾小禾', gender: '女', tag: '台湾' },
  { id: 'zh_female_wanqudashu_moon_bigtts', name: '湾区大叔', gender: '女', tag: '广东' },
  { id: 'zh_male_guozhoudege_moon_bigtts', name: '广州的哥', gender: '男', tag: '广东' },
  { id: 'zh_male_haoyuxiaoge_moon_bigtts', name: '好雨小哥', gender: '男', tag: '青岛' },
  { id: 'zh_male_beijingxiaoye_moon_bigtts', name: '北京小爷', gender: '男', tag: '北京' },
  { id: 'zh_male_jingqiangkanye_moon_bigtts', name: '京腔侃爷', gender: '男', tag: '北京' },
  { id: 'zh_female_meituojieer_moon_bigtts', name: '美托姐儿', gender: '女', tag: '长沙' },

  // === 客服 ===
  { id: 'zh_female_kefunvsheng_mars_bigtts', name: '客服女声', gender: '女' },

  // === 2.0 高表现力（seed-tts-2.0）===
  { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0', gender: '女', tag: '2.0' },
  { id: 'zh_male_m191_uranus_bigtts', name: '云舟 2.0', gender: '男', tag: '2.0' },
  { id: 'zh_female_wenroumama_uranus_bigtts', name: '温柔妈妈 2.0', gender: '女', tag: '2.0' },
  { id: 'zh_male_xuanyijieshuo_uranus_bigtts', name: '悬疑解说 2.0', gender: '男', tag: '2.0' },
  { id: 'en_female_dacey_uranus_bigtts', name: 'Dacey 2.0', gender: '女', tag: '美式 2.0' },
  { id: 'en_male_tim_uranus_bigtts', name: 'Tim 2.0', gender: '男', tag: '美式 2.0' },
];

/** 根据音色 ID 判断应使用哪个资源：uranus 走 seed-tts-2.0，其余走 seed-tts-1.0 */
export function officialResourceId(voiceId: string): string {
  if (voiceId.includes('uranus')) return 'seed-tts-2.0';
  return 'seed-tts-1.0';
}

export function officialVoiceById(id: string): OfficialVoice | undefined {
  return OFFICIAL_VOICES.find((v) => v.id === id);
}

export function isOfficialVoice(id: string): boolean {
  return OFFICIAL_VOICES.some((v) => v.id === id);
}

const CATEGORY_ORDER = [
  '通用女声',
  '通用男声',
  '情感音色',
  '英语情感',
  '视频配音',
  '有声书',
  '多语言',
  '趣味方言',
  '客服',
  '2.0 高表现力',
];

export function groupOfficialVoices(): { category: string; voices: OfficialVoice[] }[] {
  const map = new Map<string, OfficialVoice[]>();
  for (const v of OFFICIAL_VOICES) {
    const cat = inferCategory(v);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(v);
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, voices: map.get(c)! }));
}

function inferCategory(v: OfficialVoice): string {
  if (v.id.includes('uranus')) return '2.0 高表现力';
  if (v.id.startsWith('en_') && v.id.includes('emo')) return '英语情感';
  if (v.id.includes('emo')) return '情感音色';
  if (v.id.includes('conversation') || ['zh_male_tiancaitongsheng_mars_bigtts', 'zh_male_sunwukong_mars_bigtts', 'zh_male_xionger_mars_bigtts', 'zh_female_peiqi_mars_bigtts', 'zh_female_wuzetian_mars_bigtts', 'zh_female_yingtaowanzi_mars_bigtts', 'zh_male_silang_mars_bigtts', 'zh_male_jieshuonansheng_mars_bigtts'].includes(v.id)) return '视频配音';
  if (['zh_male_changtianyi_mars_bigtts', 'zh_male_ruyaqingnian_mars_bigtts', 'zh_male_baqiqingshu_mars_bigtts', 'zh_male_qingcang_mars_bigtts', 'zh_female_gufengshaoyu_mars_bigtts', 'zh_female_wenroushunv_mars_bigtts'].includes(v.id)) return '有声书';
  if (v.id.startsWith('en_')) return '多语言';
  if (['zh_female_kefunvsheng_mars_bigtts'].includes(v.id)) return '客服';
  if (['zh_female_yueyunv_mars_bigtts', 'zh_male_yuzhouzixuan_moon_bigtts', 'zh_female_daimengchuanmei_moon_bigtts', 'zh_male_guangxiyuanzhou_moon_bigtts', 'zh_male_zhoujielun_emo_v2_mars_bigtts', 'zh_female_wanwanxiaohe_moon_bigtts', 'zh_female_wanqudashu_moon_bigtts', 'zh_male_guozhoudege_moon_bigtts', 'zh_male_haoyuxiaoge_moon_bigtts', 'zh_male_beijingxiaoye_moon_bigtts', 'zh_male_jingqiangkanye_moon_bigtts', 'zh_female_meituojieer_moon_bigtts'].includes(v.id)) return '趣味方言';
  if (v.gender === '女') return '通用女声';
  return '通用男声';
}
