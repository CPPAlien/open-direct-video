# 用 ComfyUI 从 3D 镜头生成视频

OpenDirect 会从所选镜头提取 960×540 的首尾帧。启用运动参考时，也会录制该镜头的 WebM 预演。视频生成发生在你配置的 ComfyUI 实例中。OpenDirect 不会安装模型和自定义节点。

1. 在自己的 ComfyUI 启动一个能输出视频的工作流。初次尝试可以使用 ComfyUI 的 [Wan 2.2 5B 图生视频模板](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_wan2_2_5B_ti2v.json)。按模板说明安装模型，确保工作流能独立生成并保存视频。
2. 导出 API 格式的工作流（节点 ID 到 `class_type` / `inputs` 的映射），用文本编辑器修改相应节点的 `inputs`。
3. 在 OpenDirect 设置里填写 ComfyUI 地址（默认 `http://127.0.0.1:8188`）及该 JSON 的绝对路径。
4. 选中一段镜头，打开「生成视频」。输入成片风格并提交。使用视频占位符时，保持「同时录制镜头预演」勾选。

| 占位符 | 用途 |
| --- | --- |
| `__PROMPT__` | 替换文本编码节点的正向提示词，例如 `inputs.text`。 |
| `__FIRST_FRAME__` | 替换首帧 LoadImage 节点的 `inputs.image`。 |
| `__LAST_FRAME__` | 若模型支持尾帧约束，替换对应 LoadImage 节点的 `inputs.image`。 |
| `__REFERENCE_VIDEO__` | 替换接受 ComfyUI input 目录中 WebM 文件的加载节点的文件名。需要支持运动参考的工作流。 |

把字段值整体写成占位符。至少配置一种 3D 参考输入。单帧工作流只从首帧获取约束。要把角色走位和运镜传给模型，请选择能消费视频参考的工作流。确保输出节点把 MP4 或 WebM 保存到 ComfyUI 的 output 目录。任务列表依赖该实例的任务历史和输出文件，切换实例或清理历史后，旧链接可能失效。

OpenDirect 通过 ComfyUI 的 `/upload/image`、`/prompt`、`/history` 和 `/view` 接口桥接工作流。工作流设置由用户维护。
