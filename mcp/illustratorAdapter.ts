export interface VisualSceneBeat {
  index: number;
  scriptSnippet: string;
  estimatedDurationSec: number;
  shotType: 'close-up' | 'medium-shot' | 'wide-shot' | 'over-the-shoulder';
  visualDescription: string;
  promptZh: string;
  promptEn: string;
  recommendedStyle: string;
}

export interface IllustrationPlanResult {
  title: string;
  style: string;
  styleName: string;
  aspectRatio: string;
  totalScenes: number;
  estimatedTotalDurationSec: number;
  scenes: VisualSceneBeat[];
}

const STYLES_CATALOG: Record<string, { name: string; prefixZh: string; prefixEn: string }> = {
  'chinese-guochao': {
    name: '国潮新中式',
    prefixZh: '新国潮工笔重彩，东方美学构图，金箔点缀，细腻国风质感',
    prefixEn: 'Chinese Guochao art style, traditional oriental aesthetics, gold foil accents, intricate textures',
  },
  'cinematic_real': {
    name: '电影级写实',
    prefixZh: '35mm电影镜头实拍，阿莱感光柔光照明，浅景深虚化，8K超写实',
    prefixEn: 'Cinematic 35mm photography, Arri lighting, shallow depth of field, 8k photorealistic',
  },
  'claymation': {
    name: '黏土定格动画',
    prefixZh: '手工黏土定格动画，手工指纹微质感，柔和暖色棚拍微距',
    prefixEn: 'Handmade claymation style, tactile clay fingerprints, soft warm studio macro lighting',
  },
  'anime_cartoon': {
    name: '二次元日漫',
    prefixZh: '新海诚唯美动漫风，透亮光感，天空云彩细节，清新日系色彩',
    prefixEn: 'Makoto Shinkai anime aesthetic, translucent lighting, highly detailed clouds, vibrant anime art',
  },
  'cyberpunk': {
    name: '赛博朋克',
    prefixZh: '赛博朋克未来都市，全息投影，雨夜霓虹倒影，高科技低生活',
    prefixEn: 'Cyberpunk futuristic city, holographic displays, rainy night neon reflections, high-tech dystopian',
  },
  'watercolor_book': {
    name: '绘本水彩',
    prefixZh: '温馨童话手绘水彩，边缘柔和浸润，绘本治愈感，淡雅留白',
    prefixEn: 'Gentle storybook watercolor, bleeding pigment edges, whimsical warm atmosphere, poetic illustration',
  },
};

export function planScriptIllustrations(options: {
  scriptText: string;
  styleSlug?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
}): IllustrationPlanResult {
  const { scriptText, styleSlug = 'cinematic_real', aspectRatio = '9:16' } = options;
  const chosenStyle = STYLES_CATALOG[styleSlug] || STYLES_CATALOG['cinematic_real'];

  // 智能按句式和语义标点切分台词分镜
  const rawSentences = scriptText
    .split(/[\n。！？!?；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  const sentences: string[] = [];
  let buffer = '';

  for (const s of rawSentences) {
    if (buffer && (buffer + s).length < 28) {
      buffer += '，' + s;
    } else {
      if (buffer) sentences.push(buffer);
      buffer = s;
    }
  }
  if (buffer) sentences.push(buffer);

  const shotTypes: Array<VisualSceneBeat['shotType']> = ['medium-shot', 'close-up', 'wide-shot', 'medium-shot'];

  let totalDuration = 0;
  const scenes: VisualSceneBeat[] = sentences.map((snippet, idx) => {
    // 估算语速（中文约 4 字/秒，单镜至少 3 秒，最长 6 秒）
    const duration = Math.min(6, Math.max(3, Math.round(snippet.length / 3.8)));
    totalDuration += duration;

    const shotType = shotTypes[idx % shotTypes.length];
    const shotDescZh =
      shotType === 'close-up'
        ? '特写镜头聚焦主体细节'
        : shotType === 'wide-shot'
        ? '全景镜头展现宏大背景'
        : '中景镜头展现主体动作与环境关系';

    const promptZh = `${chosenStyle.prefixZh}，${shotDescZh}，画面描述：${snippet}，高精度构图，大师级画质`;
    const promptEn = `${chosenStyle.prefixEn}, ${shotType}, depicting: ${snippet}, masterpiece, highly detailed, dramatic lighting, sharp focus`;

    return {
      index: idx + 1,
      scriptSnippet: snippet,
      estimatedDurationSec: duration,
      shotType,
      visualDescription: `分镜 ${idx + 1}：${snippet} (${shotDescZh})`,
      promptZh,
      promptEn,
      recommendedStyle: chosenStyle.name,
    };
  });

  return {
    title: scriptText.slice(0, 25).trim() || 'AI 分镜规划',
    style: styleSlug,
    styleName: chosenStyle.name,
    aspectRatio,
    totalScenes: scenes.length,
    estimatedTotalDurationSec: totalDuration,
    scenes,
  };
}
