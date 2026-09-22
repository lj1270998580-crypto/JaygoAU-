import type {
  WorkflowProject,
  WorkflowNode,
  WorkflowRunHistoryItem,
  TopicSourceNodeConfig,
  AiScriptNodeConfig,
  VoiceTtsNodeConfig,
  DigitalAvatarNodeConfig,
  JianyingDraftNodeConfig,
  VideoIllustratorNodeConfig,
  ExportNotifyNodeConfig,
} from './workflowTypes';
import type { ModelHubSettings } from './modelHubTypes';
import type { SubtitleItem } from './talkEditor/types';
import { chatCompletion } from './modelHubService';
import { findSkillById } from './skillParser';
import { appendProjectHistory, saveWorkflowProject, getWorkflowProjects } from './workflowStorage';
import { buildJianyingDraftData } from './illustrator/jianyingExporter';
import { runIllustrationPipeline } from './illustrator/pipeline';
import { api } from './ipc';

export interface WorkflowExecutionContext {
  topics: string[];
  scripts: string[];
  audioPaths: string[];
  videoUrls: string[];
  draftPaths: string[];
  plannedIllustrations: any[];
  logs: string[];
  aborted?: boolean;
}

/** 违禁词/广告法极限词/平台敏感限流词映射表 */
const PROHIBITED_WORDS_MAP: Record<string, string> = {
  最顶级: '高品质',
  顶级: '出色',
  第一: '前列',
  '100%保证': '全方位保障',
  '100%': '大幅',
  绝对: '有力',
  首创: '开创性',
  绝无仅有: '难得一见',
  包赚不赔: '稳步发展',
  稳赚不赔: '风险可控',
  暴富: '财富增长',
  一夜暴富: '快速成长',
  躺赚: '持续收益',
  日入过万: '持续增收',
  全网最低: '超值优惠',
  独家首发: '精心研发',
};

function checkAndSanitizeScript(rawScript: string): { sanitized: string; hits: string[] } {
  let sanitized = rawScript;
  const hits: string[] = [];
  for (const [badWord, goodWord] of Object.entries(PROHIBITED_WORDS_MAP)) {
    if (sanitized.includes(badWord)) {
      hits.push(badWord);
      sanitized = sanitized.split(badWord).join(goodWord);
    }
  }
  return { sanitized, hits };
}

function splitScriptToSubtitles(script: string, audioDurationSec: number): SubtitleItem[] {
  const parts = script
    .split(/([，。！？；\n]+)/)
    .map(s => s.trim())
    .filter(s => s && !/^[，。！？；\n]+$/.test(s));

  if (parts.length === 0) return [];
  const totalChars = parts.reduce((acc, s) => acc + s.length, 0) || 1;
  let curTime = 0;
  const items: SubtitleItem[] = [];

  parts.forEach((text, idx) => {
    const frac = text.length / totalChars;
    const dur = Math.max(1.0, frac * audioDurationSec);
    const start = curTime;
    const end = Math.min(audioDurationSec, curTime + dur);
    curTime = end;
    items.push({
      id: `sub_${idx}_${Date.now()}`,
      startTime: start,
      endTime: end,
      text,
    });
  });
  return items;
}

export async function executeWorkflowProject(
  project: WorkflowProject,
  modelSettings: ModelHubSettings,
  onLog?: (log: string) => void,
  onProgress?: (percent: number, message: string) => void,
  abortSignal?: AbortSignal
): Promise<WorkflowExecutionContext> {
  const startTime = Date.now();
  const context: WorkflowExecutionContext = {
    topics: [],
    scripts: [],
    audioPaths: [],
    videoUrls: [],
    draftPaths: [],
    plannedIllustrations: [],
    logs: [],
  };

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    context.logs.push(entry);
    onLog?.(entry);
  };

  addLog(`=== 开始启动工作流：【${project.name}】 ===`);
  const activeNodes = project.nodes.filter(n => n.enabled);
  const totalNodes = activeNodes.length;

  let executionError: Error | null = null;
  let isAborted = false;

  try {
    try { await api?.preventAppSuspension?.(true); } catch (_) {}
    for (let i = 0; i < activeNodes.length; i++) {
      if (abortSignal?.aborted) {
        isAborted = true;
        addLog('⏹️ 用户请求强制停止，正在中止工作流...');
        break;
      }

      const node = activeNodes[i];
      const pct = Math.round((i / totalNodes) * 100);
      onProgress?.(pct, `正在执行：${node.name}`);
      addLog(`>>> [节点 ${i + 1}/${totalNodes}] 运行: ${node.name} (${node.type})`);

      try {
        switch (node.type) {
          case 'trigger': {
            const cfg = node.config as any;
            if (cfg.rawBatchText && cfg.rawBatchText.length > 0) {
              context.scripts.push(...cfg.rawBatchText);
              addLog(`已载入用户直接输入的文案 ${cfg.rawBatchText.length} 篇`);
            } else {
              addLog(`触发器执行完毕（模式: ${cfg.mode} / ${cfg.cronDescription || '立即执行'}）`);
            }
            break;
          }

          case 'topic_source': {
            const cfg = node.config as TopicSourceNodeConfig;
            if (cfg.sourceType === 'ai_brainstorm') {
              addLog(`围绕赛道【${cfg.domainKeyword}】AI 发散生成 ${cfg.generateCount} 个爆款选题...`);
              const prompt = `请围绕自媒体赛道【${cfg.domainKeyword}】，生成 ${cfg.generateCount} 个极具吸引力、高点击率和高好奇心的短视频口播选题。每行输出一个，不要输出编号和多余空话。`;
              const reply = await chatCompletion(
                [{ role: 'user', content: prompt }],
                { temperature: 0.7 },
                modelSettings
              );
              const list = reply.split('\n').map(s => s.replace(/^\d+[.、\s]*/, '').trim()).filter(Boolean);
              context.topics.push(...list.slice(0, cfg.generateCount));
              addLog(`成功发散选题：\n${context.topics.map((t, idx) => `  ${idx + 1}. ${t}`).join('\n')}`);
            } else if (cfg.poolList && cfg.poolList.length > 0) {
              const mode = cfg.poolMode || 'consume_fifo';
              let pickedTopic = '';

              if (mode === 'consume_fifo') {
                pickedTopic = cfg.poolList[0];
                cfg.consumedList = [...(cfg.consumedList || []), pickedTopic];
                cfg.poolList = cfg.poolList.slice(1);
                addLog(`[选题出队消费] 取出待办选题：${pickedTopic}，剩余待办: ${cfg.poolList.length} 条`);
              } else if (mode === 'rotate') {
                pickedTopic = cfg.poolList[0];
                cfg.poolList = [...cfg.poolList.slice(1), pickedTopic];
                addLog(`[选题轮转循环] 取出选题：${pickedTopic}，已移至队尾`);
              } else {
                // random
                const rIdx = Math.floor(Math.random() * cfg.poolList.length);
                pickedTopic = cfg.poolList[rIdx];
                addLog(`[选题随机抽取] 取出选题：${pickedTopic}`);
              }

              if (pickedTopic) {
                context.topics.push(pickedTopic);
                // 同步持久化更新当前项目的选题池状态
                saveWorkflowProject(project);
              }
            } else {
              addLog(`⚠️ 待办选题池为空，自动转为默认商业认知选题`);
              context.topics.push('普通人如何把握自媒体轻创业红利');
            }
            break;
          }

          case 'ai_script': {
            const cfg = node.config as AiScriptNodeConfig;
            const skill = findSkillById(cfg.skillPresetId) || findSkillById('teacher_zhang_business');
            const topicsToProcess = context.topics.length > 0 ? context.topics : ['自媒体变现认知认知升级'];

            addLog(`调用风格预设【${skill?.name || '默认风格'}】，单主题生成 ${cfg.batchCount || 1} 篇...`);

            for (const topic of topicsToProcess) {
              if (abortSignal?.aborted) break;

              for (let b = 0; b < (cfg.batchCount || 1); b++) {
                if (abortSignal?.aborted) break;

                addLog(`正在生成选题【${topic}】的口播文案 (版本 ${b + 1})...`);

                const systemPrompt = `你是一名顶级短视频口播脚本大师。\n【创作者人设】：${skill?.persona}\n【标志口头禅】：${skill?.catchphrases?.join('、')}\n【句长与节奏铁律】：${skill?.pacingRules?.sentenceLength}\n【行文框架】：${skill?.pacingRules?.structure}\n【绝对红线禁忌】：\n${skill?.negativeConstraints?.map(c => `- ${c}`).join('\n')}\n【少样本范本】：\n输入：${skill?.fewShotExamples?.[0]?.inputTopic || ''}\n输出：${skill?.fewShotExamples?.[0]?.outputScript || ''}`;

                const userPrompt = `请严格按照上述创作者风格，将以下主题写成一篇 60 秒（约 ${cfg.targetWordCount || 300} 字）的爆款短视频口播文案，短句断句，直接输出正文台词：\n主题：${topic}`;

                let script = await chatCompletion(
                  [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                  ],
                  { temperature: skill?.modelParams?.temperature ?? 0.35 },
                  modelSettings
                );

                script = script.trim();

                // 违禁词检测与合规校验
                if (cfg.checkProhibitedWords !== false) {
                  const check = checkAndSanitizeScript(script);
                  if (check.hits.length > 0) {
                    addLog(`⚠️ [合规检测] 文案包含敏感违禁词: ${check.hits.join('、')}，已自动替换为合规措辞`);
                    script = check.sanitized;
                  } else {
                    addLog(`🛡️ [合规检测] 文案全量合规通过`);
                  }
                }

                context.scripts.push(script);
                addLog(`文案已就绪 (${script.length} 字)`);
              }
            }
            break;
          }

          case 'voice_tts': {
            const cfg = node.config as VoiceTtsNodeConfig;
            if (context.scripts.length === 0) {
              addLog(`⚠️ 警告: 上下文中暂无文案，跳过配音合成`);
              break;
            }

            addLog(`开始为 ${context.scripts.length} 篇文案进行 Seed-TTS 2.0 语音合成...`);
            for (let sIdx = 0; sIdx < context.scripts.length; sIdx++) {
              if (abortSignal?.aborted) break;

              const script = context.scripts[sIdx];
              addLog(`正在合成第 ${sIdx + 1}/${context.scripts.length} 篇音频...`);

              const speakerId = cfg.voiceId || 'zh_female_vv_uranus_bigtts';

              const res = await api.synthesize({
                speakerId,
                text: script,
                format: cfg.audioFormat || 'mp3',
                sampleRate: 24000,
                speed: cfg.speedRatio || 1.0,
                volume: cfg.volumeRatio || 1.0,
                emotion: cfg.emotion || '开心',
                official: true,
              });

              context.audioPaths.push(res.path);
              addLog(`音频合成成功: ${res.path} (${(res.size / 1024).toFixed(1)} KB)`);
            }
            break;
          }

          case 'digital_avatar': {
            const cfg = node.config as DigitalAvatarNodeConfig;
            if (context.audioPaths.length === 0) {
              addLog(`⚠️ 警告: 未找到可用音频，跳过数字人渲染`);
              break;
            }

            addLog(`送入蝉镜数字人驱动 (字幕: ${cfg.addSubtitle ? '开启' : '关闭'})...`);

            for (let aIdx = 0; aIdx < context.audioPaths.length; aIdx++) {
              if (abortSignal?.aborted) break;

              const audioPath = context.audioPaths[aIdx];
              addLog(`正在上传临时音频到蝉镜 (${aIdx + 1}/${context.audioPaths.length})...`);

              const uploadRes = await api.chanjingUploadTempAudio({ localPath: audioPath });
              addLog(`音频上传完成，提交数字人任务...`);

              const videoTask = await api.chanjingCreateVideo({
                title: `${project.name}_${Date.now()}`,
                aspect_ratio: cfg.aspectRatio || '9:16',
                avatar_id: cfg.avatarId || 'default',
                figure_type: cfg.figureType || 'whole_body',
                audio_url: uploadRes.url,
                subtitles: cfg.addSubtitle ? 1 : 0,
                resolution: cfg.resolution || '1080p',
              } as any);

              context.videoUrls.push(videoTask.videoId);
              addLog(`数字人视频生成任务已提交 (Video ID: ${videoTask.videoId})`);
            }
            break;
          }

          case 'video_illustrator': {
            const cfg = node.config as VideoIllustratorNodeConfig;
            const scriptText = context.scripts[0] || context.topics[0] || '';
            if (!scriptText) {
              addLog(`⚠️ 警告: 上下文中暂无文案，跳过视频配图规划`);
              break;
            }

            addLog(`启动 AI 视频配图导演规划 (画风: ${cfg.styleId}, 密度: ${cfg.density})...`);
            const estDuration = Math.max(15, Math.round(scriptText.length / 3.8));

            try {
              const plans = await runIllustrationPipeline({
                scriptText,
                videoDuration: estDuration,
                density: cfg.density || 'standard',
                styleId: cfg.styleId || 'swiss-style',
                ratio: cfg.ratio || '9:16',
                routingMode: cfg.routingMode || 'smart',
                modelHubSettings: modelSettings,
                onProgress: p => {
                  onProgress?.(p.percent, `AI 视频配图: ${p.message}`);
                },
              });

              context.plannedIllustrations = plans;
              addLog(`AI 视频配图分镜规划完成，共生成 ${plans.length} 个视觉分镜镜头！`);
            } catch (illustratorErr: any) {
              addLog(`⚠️ 视频配图规划提示: ${illustratorErr.message}`);
              if (!node.continueOnError) throw illustratorErr;
            }
            break;
          }

          case 'jianying_draft': {
            const cfg = node.config as JianyingDraftNodeConfig;
            addLog(`正在组装剪映 Pro 工程草稿...`);

            const primaryScript = context.scripts[0] || '';
            const primaryAudio = context.audioPaths[0] || '';
            const estDurationSec = primaryScript ? Math.max(15, Math.round(primaryScript.length / 3.8)) : 30;

            const subItems = cfg.includeSubtitles && primaryScript
              ? splitScriptToSubtitles(primaryScript, estDurationSec)
              : [];

            const safeDateStr = new Date().toISOString().slice(0, 10);
            const draftName = (cfg.draftNameTemplate || '{projectName}_{date}')
              .replace('{projectName}', project.name)
              .replace('{date}', safeDateStr);

            try {
              const { draftContent, draftMeta } = buildJianyingDraftData({
                projectName: draftName,
                videoPath: cfg.includeAudio ? primaryAudio : undefined,
                videoDuration: estDurationSec,
                illustrations: context.plannedIllustrations || [],
                subtitles: subItems.length > 0 ? subItems : undefined,
              });

              const exportRes = await api.illustratorExportJianying({
                draftDirName: `${draftName}_${Date.now()}`,
                draftContent,
                draftMeta,
              });

              if (exportRes.ok && exportRes.draftPath) {
                context.draftPaths.push(exportRes.draftPath);
                addLog(`✅ 剪映 Pro 草稿工程已写入: ${exportRes.draftPath}`);

                if (cfg.autoOpenDir) {
                  await api.illustratorOpenFolder(exportRes.draftPath);
                  addLog(`已自动打开剪映草稿工程文件夹`);
                }
              } else {
                throw new Error(exportRes.error || '写入剪映草稿失败');
              }
            } catch (draftErr: any) {
              addLog(`❌ 剪映草稿导出异常: ${draftErr.message}`);
              if (!node.continueOnError) throw draftErr;
            }
            break;
          }

          case 'export_notify': {
            const cfg = node.config as ExportNotifyNodeConfig;
            addLog(
              `=== 流程全部完毕：文案 ${context.scripts.length} 篇，音频 ${context.audioPaths.length} 条，数字人 ${context.videoUrls.length} 个，剪映草稿 ${context.draftPaths.length} 个 ===`
            );

            if (cfg.enableTrayNotify !== false) {
              try {
                await api.showNotification({
                  title: `工作流【${project.name}】执行完毕`,
                  body: `已生成 ${context.scripts.length} 篇文案与 ${context.audioPaths.length} 条音视频产物，点击查看！`,
                  tab: 'workflow',
                });
              } catch (_) {}
            }
            break;
          }
        }
      } catch (nodeErr: any) {
        addLog(`❌ 节点【${node.name}】执行失败: ${nodeErr.message}`);
        if (node.continueOnError) {
          addLog(`⚠️ 该节点已开启「容错降级」，跳过错误继续执行后续节点`);
        } else {
          throw nodeErr;
        }
      }
    }
  } catch (err: any) {
    executionError = err;
    if (err.message === 'WORKFLOW_ABORTED' || abortSignal?.aborted) {
      isAborted = true;
      addLog(`⏹️ 工作流已被用户手动强制中止`);
    } else {
      addLog(`❌ 工作流执行异常终止: ${err.message}`);
    }
  } finally {
    try { await api?.preventAppSuspension?.(false); } catch (_) {}
  }

  // 终态持久化记录
  const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
  const finalStatus = isAborted ? 'aborted' : executionError ? 'failed' : 'success';

  const historyItem: WorkflowRunHistoryItem = {
    id: `run_${Date.now()}`,
    startTime,
    endTime: Date.now(),
    timestamp: new Date().toLocaleString(),
    durationSec,
    status: finalStatus,
    log: context.logs.join('\n'),
    logs: context.logs,
    topics: context.topics,
    generatedScripts: context.scripts,
    scripts: context.scripts,
    generatedAudioPaths: context.audioPaths,
    audioPaths: context.audioPaths,
    generatedVideoUrls: context.videoUrls,
    videoUrls: context.videoUrls,
    draftPaths: context.draftPaths,
    plannedIllustrationsCount: context.plannedIllustrations.length,
    error: executionError ? executionError.message : undefined,
  };

  context.aborted = isAborted;

  // 写入历史持久化
  try {
    appendProjectHistory(project.id, historyItem);
    addLog(`📦 运行资产与日志已持久化落盘至历史资产库`);
  } catch (_) {}

  if (finalStatus === 'success') {
    onProgress?.(100, '工作流全部执行完成！');
    addLog(`=== 工作流执行圆满完成 ===`);
  } else if (isAborted) {
    onProgress?.(100, '工作流已强制中止');
  }

  if (executionError && !isAborted) {
    throw executionError;
  }

  return context;
}
