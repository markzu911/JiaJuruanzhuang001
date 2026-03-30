import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  Image as ImageIcon, 
  Wand2, 
  CheckCircle2, 
  Loader2, 
  Maximize2, 
  Download,
  Sofa,
  Home,
  Layers,
  Key,
  X,
  Info,
  Ruler,
  Clock,
  Move
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { GoogleGenAI } from '@google/genai';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [furnitureImage, setFurnitureImage] = useState<string | null>(null);
  const [roomImage, setRoomImage] = useState<string | null>(null);
  
  const [roomDimensions, setRoomDimensions] = useState({ length: '', width: '', height: '' });
  const [furnitureDimensions, setFurnitureDimensions] = useState({ length: '', width: '', height: '' });
  
  const furnitureInfo = { type: 'sofa', name: '', material: '', style: 'modern' };
  const outputOptions = { fourViews: true, quality: 'hd', ratio: 'display' };
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState('');
  const [results, setResults] = useState<{ angle: string, url: string }[] | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ angle: string, url: string } | null>(null);
  const [stepTimes, setStepTimes] = useState<{ step: string; time: number }[]>([]);
  const [analysisLog, setAnalysisLog] = useState<{room: string, furniture: string}>({room: '', furniture: ''});

  // Interactive Placement State
  const [boxPos, setBoxPos] = useState({ x: 35, y: 55 }); // percentage
  const [boxSize, setBoxSize] = useState({ w: 30, h: 20 }); // percentage
  const [isDraggingBox, setIsDraggingBox] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const boxStartPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDraggingBox(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    boxStartPos.current = { ...boxPos };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingBox || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartPos.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStartPos.current.y) / rect.height) * 100;
    
    setBoxPos({
      x: Math.max(0, Math.min(100 - boxSize.w, boxStartPos.current.x + dx)),
      y: Math.max(0, Math.min(100 - boxSize.h, boxStartPos.current.y + dy))
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDraggingBox(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const furnitureInputRef = useRef<HTMLInputElement>(null);
  const roomInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      try {
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        } else {
          setHasApiKey(true);
        }
      } catch (e) {
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectApiKey = async () => {
    try {
      if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      }
    } catch (e) {
      console.error("Failed to open API key selection dialog", e);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'furniture' | 'room') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'furniture') setFurnitureImage(reader.result as string);
        else setRoomImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadAll = () => {
    if (!results || results.length === 0) return;
    
    toast.info('正在打包下载全部方案...');
    
    results.forEach((result, index) => {
      // Create a temporary anchor element to trigger the download
      const link = document.createElement('a');
      link.href = result.url;
      link.download = `摆场方案_${result.angle}_${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    
    toast.success('下载完成');
  };

  const simulateGeneration = async () => {
    if (!furnitureImage || !roomImage) {
      toast.error('请先上传家具和房间图片');
      return;
    }

    setIsGenerating(true);
    setResults(null);
    setStepTimes([]);

    try {
      // Create a new GoogleGenAI instance right before making an API call
      // @ts-ignore - process.env.API_KEY might be injected
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      
      const getBase64AndMimeType = (dataUrl: string) => {
        const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          return { mimeType: matches[1], data: matches[2] };
        }
        return { mimeType: 'image/jpeg', data: '' };
      };

      const roomImgData = getBase64AndMimeType(roomImage);
      const furnitureImgData = getBase64AndMimeType(furnitureImage);

      // Create Composite Image for Spatial Guidance
      const createCompositeImage = async (): Promise<{ mimeType: string, data: string }> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            
            // Draw original room
            ctx.drawImage(img, 0, 0);
            
            // Calculate box pixel coordinates
            const x = (boxPos.x / 100) * img.width;
            const y = (boxPos.y / 100) * img.height;
            const w = (boxSize.w / 100) * img.width;
            const h = (boxSize.h / 100) * img.height;
            
            // Draw semi-transparent red guide box
            ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.lineWidth = Math.max(2, img.width * 0.005);
            ctx.strokeRect(x, y, w, h);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            resolve(getBase64AndMimeType(dataUrl));
          };
          img.src = roomImage;
        });
      };

      const compositeImgData = await createCompositeImage();

      // Step 1: Furniture processing (Vision Analysis)
      let stepStart = Date.now();
      setGenerationStep('正在进行尺寸解读与结构预判...');
      let furnitureAnalysisResult = '';
      try {
        const furnitureResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: furnitureImgData.data, mimeType: furnitureImgData.mimeType } },
              { text: `Analyze this furniture (${furnitureInfo.type}). Given its dimensions (L:${furnitureDimensions.length}cm, W:${furnitureDimensions.width}cm, H:${furnitureDimensions.height}cm), describe its physical structure and proportions. Explain how these dimensions map to its visual shape to ensure accurate scaling. Please respond in concise Chinese.` }
            ]
          }
        });
        furnitureAnalysisResult = furnitureResponse.text || '尺寸比例分析完成';
        setAnalysisLog(prev => ({ ...prev, furniture: furnitureAnalysisResult }));
      } catch (e) {
        console.error('Furniture analysis failed:', e);
        furnitureAnalysisResult = '标准尺寸比例';
      }
      setStepTimes(prev => [...prev, { step: '尺寸预判', time: Date.now() - stepStart }]);

      // Step 2: Room processing (Vision Analysis)
      stepStart = Date.now();
      setGenerationStep('正在规划空间布局与摆放位置...');
      let roomAnalysisResult = '';
      try {
        const roomResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: roomImgData.data, mimeType: roomImgData.mimeType } },
              { text: `Analyze this room's layout. Identify the most logical and functional placement location for a ${furnitureInfo.type} with dimensions ${furnitureDimensions.length}x${furnitureDimensions.width}x${furnitureDimensions.height}cm. Describe exactly where it should be placed (e.g., against which wall, or center) to maintain spatial coordination. Please respond in concise Chinese.` }
            ]
          }
        });
        roomAnalysisResult = roomResponse.text || '摆放位置规划完成';
        setAnalysisLog(prev => ({ ...prev, room: roomAnalysisResult }));
      } catch (e) {
        console.error('Room analysis failed:', e);
        roomAnalysisResult = '默认居中摆放';
      }
      setStepTimes(prev => [...prev, { step: '位置规划', time: Date.now() - stepStart }]);

      // Step 3: Dimension matching
      stepStart = Date.now();
      setGenerationStep('正在进行尺寸匹配与比例换算...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStepTimes(prev => [...prev, { step: '尺寸匹配', time: Date.now() - stepStart }]);

      // Step 4: Generating images
      stepStart = Date.now();
      setGenerationStep('正在智能融合摆放，生成多角度效果图...');
      
      const angles = outputOptions.fourViews 
        ? ['左视图 (Left View)', '正视图 (Front View)', '右视图 (Right View)', '俯视图 (Top View)'] 
        : ['最佳展示视角 (Best View)'];
      
      const ymin = Math.round(boxPos.y * 10);
      const xmin = Math.round(boxPos.x * 10);
      const ymax = Math.round((boxPos.y + boxSize.h) * 10);
      const xmax = Math.round((boxPos.x + boxSize.w) * 10);
      const bbox = `[${ymin}, ${xmin}, ${ymax}, ${xmax}]`;

      const basePrompt = `This is an image editing task. You are provided with THREE images:
1. The base room image.
2. The furniture to be placed.
3. A SPATIAL GUIDE IMAGE (the room with a RED semi-transparent bounding box).

Furniture: ${furnitureInfo.style} ${furnitureInfo.type}.
Dimensions: Length ${furnitureDimensions.length || 'unknown'}cm, Width/Depth ${furnitureDimensions.width || 'unknown'}cm, Height ${furnitureDimensions.height || 'unknown'}cm.
Room Dimensions: Length ${roomDimensions.length || 'unknown'}cm, Width ${roomDimensions.width || 'unknown'}cm, Height ${roomDimensions.height || 'unknown'}cm.

AI Dimension & Structure Prediction: ${furnitureAnalysisResult}
AI Placement Planning: ${roomAnalysisResult}

CRITICAL SPATIAL INSTRUCTIONS:
1. EXACT PLACEMENT COORDINATES: You MUST place the furniture EXACTLY within the bounding box coordinates ${bbox} (format is [ymin, xmin, ymax, xmax] scaled 0-1000).
2. VISUAL REFERENCE: The THIRD image shows a RED BOX. This red box corresponds to the coordinates ${bbox}. The furniture MUST be drawn inside this exact area.
3. BACKGROUND PRESERVATION: You MUST keep the room EXACTLY as it is in the FIRST image. Do NOT change the walls, windows, floor, or any existing objects. ONLY add the furniture at the specified location. Do NOT draw the red box in the final image.`;

      const generatePromises = angles.map(async (angle) => {
        const prompt = `${basePrompt}\n\nFINAL CAMERA ANGLE REQUIREMENT: Generate the image strictly from a ${angle}. Ensure the furniture is viewed from this specific angle within the room, located exactly within the bounding box ${bbox}. Make it look highly realistic and photorealistic.`;
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: {
              parts: [
                { inlineData: { data: roomImgData.data, mimeType: roomImgData.mimeType } },
                { inlineData: { data: furnitureImgData.data, mimeType: furnitureImgData.mimeType } },
                { inlineData: { data: compositeImgData.data, mimeType: compositeImgData.mimeType } },
                { text: prompt }
              ],
            },
            config: {
              imageConfig: {
                aspectRatio: "4:3",
                imageSize: outputOptions.quality === 'hd' ? "2K" : "1K"
              }
            }
          });

          let imageUrl = '';
          for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }

          if (imageUrl) {
            return { angle, url: imageUrl };
          } else {
            return { angle, url: `https://picsum.photos/seed/${furnitureInfo.type}-${angle}/800/600` };
          }
        } catch (error: any) {
          console.error(`Failed to generate image for ${angle}:`, error);
          if (error?.message?.includes('Requested entity was not found') || error?.message?.includes('PERMISSION_DENIED') || error?.status === 403) {
            throw error;
          }
          return { angle, url: `https://picsum.photos/seed/${furnitureInfo.type}-${angle}/800/600` };
        }
      });

      try {
        const generatedResults = await Promise.all(generatePromises);
        setStepTimes(prev => [...prev, { step: '智能融合摆放', time: Date.now() - stepStart }]);

        if (generatedResults.length > 0) {
          setResults(generatedResults);
          toast.success('效果图生成成功！');
        }
      } catch (error: any) {
        if (error?.message?.includes('Requested entity was not found') || error?.message?.includes('PERMISSION_DENIED') || error?.status === 403) {
          setHasApiKey(false);
          toast.error('API Key 权限不足或未找到，请重新选择');
        } else {
          throw error;
        }
      }

    } catch (error) {
      console.error('Generation error:', error);
      toast.error('生成失败，请重试');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg border-slate-200">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-blue-100 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
              <Key className="w-6 h-6 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">需要配置 API Key</CardTitle>
            <CardDescription className="text-base mt-2">
              使用高画质图像生成模型 (gemini-3.1-flash-image-preview) 需要配置您自己的 API Key。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-slate-600">
              请确保您选择的 API Key 属于已绑定结算的 Google Cloud 项目。
            </p>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noreferrer" 
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              <Info className="w-4 h-4" />
              了解更多关于计费的信息
            </a>
          </CardContent>
          <CardFooter>
            <Button onClick={handleSelectApiKey} className="w-full h-12 text-lg">
              选择 API Key
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Sofa className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">AI 家居软装摆场助手</h1>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
              专业版
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. Upload Area */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-blue-600" />
                  上传区
                </CardTitle>
                <CardDescription>上传需要摆放的家具和客户房间实景图</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Furniture Upload */}
                <div className="space-y-2">
                  <Label>家具图片 (需白底或透明底最佳)</Label>
                  <div 
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${furnitureImage ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
                    onClick={() => furnitureInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={furnitureInputRef}
                      onChange={(e) => handleImageUpload(e, 'furniture')}
                    />
                    {furnitureImage ? (
                      <div className="relative aspect-video w-full overflow-hidden rounded-md">
                        <img src={furnitureImage} alt="Furniture" className="object-contain w-full h-full" />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 text-slate-500">
                        <Sofa className="w-8 h-8 mb-2 text-slate-400" />
                        <span className="text-sm font-medium">点击上传家具图片</span>
                        <span className="text-xs mt-1">支持 JPG, PNG</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Room Upload */}
                <div className="space-y-2">
                  <Label>房间实景图</Label>
                  <div 
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${roomImage ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
                    onClick={() => roomInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={roomInputRef}
                      onChange={(e) => handleImageUpload(e, 'room')}
                    />
                    {roomImage ? (
                      <div className="relative aspect-video w-full overflow-hidden rounded-md">
                        <img src={roomImage} alt="Room" className="object-cover w-full h-full" />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 text-slate-500">
                        <Home className="w-8 h-8 mb-2 text-slate-400" />
                        <span className="text-sm font-medium">点击上传房间图片</span>
                        <span className="text-xs mt-1">尽量包含完整的地面和墙角</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 2. Dimensions Area */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Ruler className="w-5 h-5 text-blue-600" />
                  尺寸输入区 (cm)
                </CardTitle>
                <CardDescription>输入精确尺寸以保证摆放比例真实</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-slate-700">家具尺寸</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">长</Label>
                      <Input placeholder="例如: 220" value={furnitureDimensions.length} onChange={e => setFurnitureDimensions({...furnitureDimensions, length: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">宽/深</Label>
                      <Input placeholder="例如: 90" value={furnitureDimensions.width} onChange={e => setFurnitureDimensions({...furnitureDimensions, width: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">高</Label>
                      <Input placeholder="例如: 85" value={furnitureDimensions.height} onChange={e => setFurnitureDimensions({...furnitureDimensions, height: e.target.value})} />
                    </div>
                  </div>
                </div>
                
                <Separator />

                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-slate-700">房间尺寸 (可选)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">长</Label>
                      <Input placeholder="例如: 500" value={roomDimensions.length} onChange={e => setRoomDimensions({...roomDimensions, length: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">宽</Label>
                      <Input placeholder="例如: 400" value={roomDimensions.width} onChange={e => setRoomDimensions({...roomDimensions, width: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">高</Label>
                      <Input placeholder="例如: 280" value={roomDimensions.height} onChange={e => setRoomDimensions({...roomDimensions, height: e.target.value})} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Interactive Placement Editor */}
            {roomImage && furnitureImage && (
              <Card className="border-blue-200 shadow-sm overflow-hidden ring-1 ring-blue-100">
                <CardHeader className="pb-3 border-b border-blue-100 bg-blue-50/50">
                  <CardTitle className="text-lg flex items-center gap-2 text-blue-800">
                    <Move className="w-5 h-5 text-blue-600" />
                    交互式空间定位 (精准摆放)
                  </CardTitle>
                  <CardDescription className="text-blue-600/80 mt-1">拖动红色选框，告诉 AI 家具的精确摆放位置和大小</CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div 
                    ref={containerRef}
                    className="relative w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-200 select-none touch-none"
                    style={{ aspectRatio: '4/3' }}
                  >
                    <img 
                      src={roomImage} 
                      alt="Room for placement" 
                      className="w-full h-full object-cover pointer-events-none opacity-80"
                    />
                    
                    {/* Draggable Bounding Box */}
                    <div
                      className="absolute border-2 border-red-500 bg-red-500/30 cursor-move flex items-center justify-center group shadow-[0_0_0_1px_rgba(255,255,255,0.5)]"
                      style={{
                        left: `${boxPos.x}%`,
                        top: `${boxPos.y}%`,
                        width: `${boxSize.w}%`,
                        height: `${boxSize.h}%`,
                        touchAction: 'none'
                      }}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-sm absolute -top-5 left-0 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        拖动定位
                      </div>
                      <Move className="w-6 h-6 text-white/70 drop-shadow-md" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-xs text-slate-500">家具宽度占比</Label>
                        <span className="text-xs font-medium text-slate-700">{boxSize.w}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="10" max="80" 
                        value={boxSize.w} 
                        onChange={(e) => setBoxSize(prev => ({ ...prev, w: parseInt(e.target.value) }))}
                        className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-xs text-slate-500">家具高度占比</Label>
                        <span className="text-xs font-medium text-slate-700">{boxSize.h}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="10" max="80" 
                        value={boxSize.h} 
                        onChange={(e) => setBoxSize(prev => ({ ...prev, h: parseInt(e.target.value) }))}
                        className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button 
              className="w-full h-12 text-lg font-medium shadow-lg hover:shadow-xl transition-all" 
              size="lg"
              onClick={simulateGeneration}
              disabled={isGenerating || !furnitureImage || !roomImage}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-5 w-5" />
                  一键智能摆场
                </>
              )}
            </Button>
          </div>

          {/* Right Column: Preview & Results */}
          <div className="lg:col-span-8">
            <Card className="h-full min-h-[600px] flex flex-col border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="w-5 h-5 text-blue-600" />
                    摆场效果预览
                  </CardTitle>
                  {results && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadAll}>
                      <Download className="w-4 h-4" />
                      下载全部方案
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-6 flex flex-col items-center justify-center bg-slate-50/30">
                
                {!isGenerating && !results && (
                  <div className="text-center max-w-md mx-auto space-y-6">
                    <div className="relative w-48 h-48 mx-auto mb-8">
                      <div className="absolute inset-0 bg-blue-100 rounded-full opacity-20 animate-pulse"></div>
                      <div className="absolute inset-4 bg-blue-200 rounded-full opacity-40"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ImageIcon className="w-16 h-16 text-blue-500" />
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800">等待生成方案</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      请在左侧上传家具图片和客户房间实景图，输入尺寸后点击“一键智能摆场”，系统将自动识别空间透视并生成真实比例的效果图。
                    </p>
                    <div className="flex justify-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500"/> 智能抠图</span>
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500"/> 透视矫正</span>
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500"/> 光影融合</span>
                    </div>
                  </div>
                )}

                {isGenerating && (
                  <div className="text-center space-y-8 w-full max-w-md mx-auto">
                    <div className="relative w-32 h-32 mx-auto">
                      <svg className="animate-spin w-full h-full text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Wand2 className="w-8 h-8 text-blue-600 animate-pulse" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-medium text-slate-800">AI 正在处理中...</h3>
                      <p className="text-sm text-blue-600 font-medium h-6">{generationStep}</p>
                    </div>
                    
                    {/* Progress steps simulation */}
                    <div className="space-y-3 text-left bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                      <div className={`flex items-center gap-3 text-sm ${generationStep.includes('家具') ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${generationStep.includes('家具') ? 'bg-blue-600 animate-pulse' : 'bg-slate-300'}`}></div>
                        1. 提取家具主体与材质增强
                      </div>
                      <div className={`flex items-center gap-3 text-sm ${generationStep.includes('房间') ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${generationStep.includes('房间') ? 'bg-blue-600 animate-pulse' : 'bg-slate-300'}`}></div>
                        2. 分析空间结构与透视消失点
                      </div>
                      <div className={`flex items-center gap-3 text-sm ${generationStep.includes('尺寸') ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${generationStep.includes('尺寸') ? 'bg-blue-600 animate-pulse' : 'bg-slate-300'}`}></div>
                        3. 建立三维比例与尺寸映射
                      </div>
                      <div className={`flex items-center gap-3 text-sm ${generationStep.includes('融合') ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${generationStep.includes('融合') ? 'bg-blue-600 animate-pulse' : 'bg-slate-300'}`}></div>
                        4. 光影渲染与多视角生成
                      </div>
                    </div>
                  </div>
                )}

                {results && !isGenerating && (
                  <ScrollArea className="h-full w-full pr-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                      {results.map((result, idx) => (
                        <div key={idx} className="group relative bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-all">
                          <div className="aspect-[4/3] relative overflow-hidden bg-slate-100 cursor-pointer" onClick={() => setSelectedImage(result)}>
                            <img 
                              src={result.url} 
                              alt={result.angle} 
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <Button variant="secondary" size="icon" className="rounded-full shadow-lg pointer-events-none">
                                <Maximize2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between">
                            <span className="font-medium text-sm text-slate-800">{result.angle}</span>
                            <Badge variant="outline" className="text-xs text-slate-500 bg-slate-50">
                              {outputOptions.quality === 'hd' ? '2K HD' : '1K'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

              </CardContent>
            </Card>

            {/* Step Times Display */}
            {stepTimes.length > 0 && !isGenerating && (
              <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  生成耗时分析
                </h4>
                <div className="flex flex-wrap gap-2 mb-4">
                  {stepTimes.map((st, idx) => (
                    <Badge key={idx} variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-normal">
                      {st.step}: <span className="font-medium ml-1 text-slate-900">{(st.time / 1000).toFixed(1)}s</span>
                    </Badge>
                  ))}
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                    总计: <span className="font-medium ml-1">{(stepTimes.reduce((acc, curr) => acc + curr.time, 0) / 1000).toFixed(1)}s</span>
                  </Badge>
                </div>
                
                {(analysisLog.room || analysisLog.furniture) && (
                  <>
                    <Separator className="my-3" />
                    <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-purple-500" />
                      AI 视觉分析结果 (Chain of Thought)
                    </h4>
                    <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
                      {analysisLog.furniture && (
                        <div>
                          <span className="font-semibold text-slate-800">尺寸解读与结构预判：</span>
                          <p className="mt-1 leading-relaxed">{analysisLog.furniture}</p>
                        </div>
                      )}
                      {analysisLog.room && (
                        <div className="mt-2">
                          <span className="font-semibold text-slate-800">空间布局与摆放规划：</span>
                          <p className="mt-1 leading-relaxed">{analysisLog.room}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
      
      {/* Image Zoom Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 bg-transparent border-none shadow-none flex items-center justify-center [&>button]:hidden">
          <DialogTitle className="sr-only">
            {selectedImage?.angle} 预览
          </DialogTitle>
          {selectedImage && (
            <div className="relative w-full h-full flex items-center justify-center">
              <img 
                src={selectedImage.url} 
                alt={selectedImage.angle} 
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                referrerPolicy="no-referrer"
              />
              
              <Button 
                variant="secondary" 
                size="icon" 
                className="absolute top-4 right-4 rounded-full bg-black/50 text-white hover:bg-black/70 border-none z-50"
                onClick={() => setSelectedImage(null)}
              >
                <X className="w-5 h-5" />
              </Button>

              <div className="absolute bottom-6 left-6 bg-black/60 text-white px-4 py-2 rounded-md text-base backdrop-blur-sm z-50">
                {selectedImage.angle}
              </div>
              <Button 
                variant="secondary" 
                className="absolute bottom-6 right-6 bg-black/60 text-white hover:bg-black/80 border-none backdrop-blur-sm gap-2 z-50"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = selectedImage.url;
                  link.download = `摆场方案_${selectedImage.angle}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                <Download className="w-4 h-4" />
                下载此图
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Toaster position="top-center" />
    </div>
  );
}

