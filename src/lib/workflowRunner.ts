import type { WorkflowProject, WorkflowNode } from './workflowTypes';
import type { ModelHubSettings } from './modelHubTypes';
import { chatCompletion } from './modelHubService';
import { findSkillById } from './skillParser';
import { api } from './ipc';

export interface WorkflowExecutionContext {
  topics: string[];
  scripts: string[];
  audioPaths: string[];
  videoUrls: string[];
  logs: string[];
}

export async function executeWorkflowProject(
  project: WorkflowProject,
  modelSettings: ModelHubSettings,
  onLog?: (log: string) => void,
  onProgress?: (percent: number, message: string) => void
): Promise<WorkflowExecutionContext> {
  const context: WorkflowExecutionContext = {
    topics: [],
    scripts: [],
    audioPaths: [],
    videoUrls: [],
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

  for (let i = 0; i < activeNodes.length; i++) {
    const node = activeNodes[i];
    const pct = Math.round(((i) / totalNodes) * 100);
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
          const cfg = node.config as any;
          if (cfg.sourceType === 'ai_brainstorm') {
            addLog(`正在围绕赛道【${cfg.domainKeyword}】发散生成 ${cfg.generateCount} 个爆款选题...`);
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
            const picked = cfg.poolList[0];
            context.topics.push(picked);
            addLog(`从待办选题池中取出：${picked}`);
          }
          break;
        }

        case 'ai_script': {
          const cfg = node.config as any;
          const skill = findSkillById(cfg.skillPresetId) || findSkillById('teacher_zhang_business');
          const topicsToProcess = context.topics.length > 0 ? context.topics : ['普通人如何把握自媒体红利'];

          addLog(`调用创作者风格预设【${skill?.name || '默认风格'}】，单主题生成 ${cfg.batchCount || 1} 篇...`);

          for (const topic of topicsToProcess) {
            for (let b = 0; b < (cfg.batchCount || 1); b++) {
              addLog(`正在生成选题【${topic}】的口播文案 (版本 ${b + 1})...`);

              const systemPrompt = `你是一名顶级短视频口播脚本大师。\n【创作者人设】：${skill?.persona}\n【标志口头禅】：${skill?.catchphrases?.join('、')}\n【句长与节奏铁律】：${skill?.pacingRules?.sentenceLength}\n【行文框架】：${skill?.pacingRules?.structure}\n【绝对红线禁忌】：\n${skill?.negativeConstraints?.map(c => `- ${c}`).join('\n')}\n【少样本范本】：\n输入：${skill?.fewShotExamples?.[0]?.inputTopic || ''}\n输出：${skill?.fewShotExamples?.[0]?.outputScript || ''}`;

              const userPrompt = `请严格按照上述创作者风格，将以下主题写成一篇 60 秒（约 ${cfg.targetWordCount || 300} 字）的爆款短视频口播文案，短句断句，直接输出正文台词：\n主题：${topic}`;

              const script = await chatCompletion(
                [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                { temperature: skill?.modelParams?.temperature ?? 0.35 },
                modelSettings
              );

              context.scripts.push(script.trim());
              addLog(`文案已生成 (${script.length} 字)`);
            }
          }
          break;
        }

        case 'voice_tts': {
          const cfg = node.config as any;
          if (context.scripts.length === 0) {
            addLog(`⚠️ 警告: 上下文中暂无文案，跳过配音合成`);
            break;
          }

          addLog(`开始为 ${context.scripts.length} 篇文案进行 Seed-TTS 2.0 语音合成...`);
          for (let sIdx = 0; sIdx < context.scripts.length; sIdx++) {
            const script = context.scripts[sIdx];
            addLog(`正在合成第 ${sIdx + 1}/${context.scripts.length} 篇音频...`);

            // 如果未指定音色，查找前置 skill 绑定的音色
            let speakerId = cfg.voiceId || 'zh_female_vv_uranus_bigtts';
            if (!cfg.voiceId) {
              speakerId = 'zh_female_vv_uranus_bigtts';
            }

            try {
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
            } catch (synthErr: any) {
              addLog(`❌ 音频合成失败: ${synthErr.message}`);
            }
          }
          break;
        }

        case 'digital_avatar': {
          const cfg = node.config as any;
          if (context.audioPaths.length === 0) {
            addLog(`⚠️ 警告: 未找到可驱动的音频，跳过数字人渲染`);
            break;
          }

          addLog(`开始将 ${context.audioPaths.length} 条音频送入蝉镜数字人驱动 (字幕: ${cfg.addSubtitle ? '开启' : '关闭'})...`);

          for (let aIdx = 0; aIdx < context.audioPaths.length; aIdx++) {
            const audioPath = context.audioPaths[aIdx];
            addLog(`正在上传临时音频到蝉镜 (${aIdx + 1}/${context.audioPaths.length})...`);

            try {
              const uploadRes = await api.chanjingUploadTempAudio({ localPath: audioPath });
              addLog(`音频直传成功，正在提交数字人视频渲染任务...`);

              const videoTask = await api.chanjingCreateVideo({
                title: `${project.name}_${Date.now()}`,
                aspect_ratio: cfg.aspectRatio || '9:16',
                avatar_id: cfg.avatarId || 'default',
                figure_type: cfg.figureType || 'whole_body',
                audio_url: uploadRes.url,
                subtitles: cfg.addSubtitle ? 1 : 0, // 关键：字幕开关！
                resolution: cfg.resolution || '1080p',
              } as any);

              context.videoUrls.push(videoTask.videoId);
              addLog(`数字人视频生成任务已提交成功 (Video ID: ${videoTask.videoId})`);
            } catch (avatarErr: any) {
              addLog(`❌ 数字人提交异常: ${avatarErr.message}`);
            }
          }
          break;
        }

        case 'export_notify': {
          const cfg = node.config as any;
          addLog(`=== 流程执行完毕，已沉淀文案 ${context.scripts.length} 篇，音频 ${context.audioPaths.length} 条，数字人任务 ${context.videoUrls.length} 个 ===`);

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
      throw nodeErr;
    }
  }

  onProgress?.(100, '工作流全部执行完成！');
  addLog(`=== 工作流执行圆满完成 ===`);
  return context;
}
