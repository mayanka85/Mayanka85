import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  FileText, 
  ArrowRightLeft, 
  History, 
  MessageSquare, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  LogOut,
  Loader2,
  Send,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Download,
  FileDown
} from 'lucide-react';
import { auth, db, signIn, logOut, collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { lookupRegulatorySection, analyzeRegulatoryQuery, RegulatoryComparison } from './services/gemini';
import { SearchResult } from './types';
import { AuthOverlay } from './components/AuthOverlay';
import { SearchHistory } from './components/SearchHistory';
import { RegulatoryTable } from './components/RegulatoryTable';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { ScrollArea } from './components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Separator } from './components/ui/separator';
import { Skeleton } from './components/ui/skeleton';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { 
  Group as ResizablePanelGroup, 
  Panel as ResizablePanel, 
  Separator as ResizableHandle 
} from "react-resizable-panels";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [currentResult, setCurrentResult] = useState<RegulatoryComparison | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCrr, setEditedCrr] = useState('');
  const [editedPs, setEditedPs] = useState('');
  const [history, setHistory] = useState<SearchResult[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'searches'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SearchResult[];
      setHistory(results);
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchInput.trim()) return;

    setSearching(true);
    setError(null);
    try {
      const result = await lookupRegulatorySection(searchInput);
      setCurrentResult(result);
      setEditedCrr(result.crrText);
      setEditedPs(result.psText);
      setIsEditing(false);
      
      if (user) {
        await addDoc(collection(db, 'searches'), {
          userId: user.uid,
          query: searchInput,
          timestamp: serverTimestamp(),
          result
        });
      }
    } catch (err) {
      console.error('Search failed:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred while searching.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectHistory = (item: SearchResult) => {
    setCurrentResult(item.result);
    setEditedCrr(item.result.crrText);
    setEditedPs(item.result.psText);
    setIsEditing(false);
  };

  const handleExportPDF = () => {
    if (!currentResult) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    doc.text('Regulatory Comparative Analysis Report', 15, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 28);
    doc.text(`Query: ${searchInput}`, 15, 33);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(15, 38, pageWidth - 15, 38);

    // Executive Briefing Section
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('1. Strategic Synthesis', 15, 50);
    
    doc.setFontSize(11);
    doc.text(`Strategic Impact: ${currentResult.executiveBriefing.strategicImpact}`, 15, 60);
    doc.text(`Capital Impact: ${currentResult.executiveBriefing.capitalImpact}`, 15, 67);
    doc.text(`Operational Complexity: ${currentResult.executiveBriefing.operationalComplexity}`, 15, 74);
    
    doc.setFontSize(12);
    doc.text('Key Takeaways:', 15, 85);
    doc.setFontSize(10);
    let y = 92;
    currentResult.executiveBriefing.keyTakeaways.forEach((point, i) => {
      const lines = doc.splitTextToSize(`• ${point}`, pageWidth - 30);
      doc.text(lines, 20, y);
      y += (lines.length * 5) + 2;
    });

    doc.setFontSize(12);
    doc.text('Business Implications:', 15, y + 5);
    doc.setFontSize(10);
    const implLines = doc.splitTextToSize(currentResult.executiveBriefing.businessImplications, pageWidth - 30);
    doc.text(implLines, 15, y + 12);
    y += (implLines.length * 5) + 20;

    // Comparison Table
    doc.addPage();
    doc.setFontSize(16);
    doc.text('2. Professional Delta Review', 15, 20);
    
    const tableData = currentResult.comparisonTable.map(row => [
      row.dimension,
      row.crrValue,
      row.psValue,
      row.changeType
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Dimension', 'CRR Baseline', 'PS01/2026 Position', 'Divergence Type']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    // EBA Q&As
    if (currentResult.ebaQas && currentResult.ebaQas.length > 0) {
      doc.addPage();
      doc.setFontSize(16);
      doc.text('3. EBA Interpretative Guidance', 15, 20);
      
      let qY = 30;
      currentResult.ebaQas.forEach((qa) => {
        if (qY > 250) {
          doc.addPage();
          qY = 20;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Q&A ID: ${qa.id}`, 15, qY);
        qY += 6;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const qLines = doc.splitTextToSize(`Question: ${qa.question}`, pageWidth - 30);
        doc.text(qLines, 15, qY);
        qY += (qLines.length * 5) + 2;
        
        doc.setTextColor(80, 80, 80);
        const aLines = doc.splitTextToSize(`Answer: ${qa.answer}`, pageWidth - 35);
        doc.text(aLines, 20, qY);
        qY += (aLines.length * 5) + 12;
        doc.setTextColor(0, 0, 0);
      });
    }

    doc.save(`Regulatory_Analysis_${searchInput.replace(/\s+/g, '_')}.pdf`);
  };

  const handleExportWord = async () => {
    if (!currentResult) return;

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "Regulatory Comparative Analysis Report",
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Generated on: ${new Date().toLocaleString()}`, size: 20, color: "666666" }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Query: ${searchInput}`, size: 20, color: "666666" }),
            ],
          }),

          new Paragraph({ text: "1. Strategic Synthesis", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
          new Paragraph({ children: [new TextRun({ text: `Strategic Impact: `, bold: true }), new TextRun(currentResult.executiveBriefing.strategicImpact)] }),
          new Paragraph({ children: [new TextRun({ text: `Capital Impact: `, bold: true }), new TextRun(currentResult.executiveBriefing.capitalImpact)] }),
          new Paragraph({ children: [new TextRun({ text: `Operational Complexity: `, bold: true }), new TextRun(currentResult.executiveBriefing.operationalComplexity)] }),
          
          new Paragraph({ children: [new TextRun({ text: "Key Takeaways:", bold: true })], spacing: { before: 200 } }),
          ...currentResult.executiveBriefing.keyTakeaways.map(point => new Paragraph({ text: `• ${point}`, bullet: { level: 0 } })),
          
          new Paragraph({ children: [new TextRun({ text: "Business Implications:", bold: true })], spacing: { before: 200 } }),
          new Paragraph({ children: [new TextRun({ text: currentResult.executiveBriefing.businessImplications, italics: true })] }),

          new Paragraph({ text: "2. Professional Delta Review", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Dimension", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "CRR Value", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "PS Value", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Impact", bold: true })] })] }),
                ],
              }),
              ...currentResult.comparisonTable.map(row => new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(row.dimension)] }),
                  new TableCell({ children: [new Paragraph(row.crrValue)] }),
                  new TableCell({ children: [new Paragraph(row.psValue)] }),
                  new TableCell({ children: [new Paragraph(row.changeType)] }),
                ],
              })),
            ],
          }),

          new Paragraph({ text: "3. EBA Interpretative Guidance", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
          ...(currentResult.ebaQas || []).flatMap(qa => [
            new Paragraph({ children: [new TextRun({ text: `Q&A ID: ${qa.id}`, bold: true })], spacing: { before: 200 } }),
            new Paragraph({ children: [new TextRun({ text: "Question: ", bold: true }), new TextRun(qa.question)] }),
            new Paragraph({ children: [new TextRun({ text: "Answer: ", bold: true }), new TextRun(qa.answer)] }),
          ]),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Regulatory_Analysis_${searchInput.replace(/\s+/g, '_')}.docx`);
  };

  const handleChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || analyzing) return;

    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setAnalyzing(true);

    try {
      const context = currentResult ? JSON.stringify(currentResult) : '';
      const response = await analyzeRegulatoryQuery(userMsg, context);
      setChatMessages(prev => [...prev, { role: 'ai', content: response }]);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // No login requirement - return main application directly
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground fancy-gradient-bg">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40 fancy-shadow">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <ShieldCheck className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">CRR × PS01/2026</h1>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Regulatory Lookup Engine v1.0</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-2 px-4 py-1.5 border border-border rounded-full bg-card/50 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Live Regulatory Feed</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowHistory(!showHistory)}
                className={`w-9 h-9 rounded-xl transition-all ${!showHistory ? 'text-muted-foreground' : 'text-primary bg-primary/10'}`}
                title="Toggle History"
              >
                <History className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowChat(!showChat)}
                className={`w-9 h-9 rounded-xl transition-all ${!showChat ? 'text-muted-foreground' : 'text-primary bg-primary/10'}`}
                title="Toggle AI Assistant"
              >
                <MessageSquare className="w-5 h-5" />
              </Button>
            </div>

            <Separator orientation="vertical" className="h-4 bg-border" />
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <div className="text-right hidden sm:block">
                    <p className="text-[11px] font-semibold text-foreground">{user.displayName}</p>
                    <p className="text-[9px] text-muted-foreground font-mono">{user.email}</p>
                  </div>
                  <button 
                    onClick={logOut}
                    className="p-2 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-primary hover:scale-110 active:scale-90"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <Button 
                  onClick={signIn}
                  variant="outline"
                  size="sm"
                  className="rounded-xl px-4 text-[10px] uppercase font-bold tracking-widest border-2 hover:border-primary hover:text-primary transition-all shadow-sm"
                >
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto h-[calc(100vh-64px)] overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          {/* Left Sidebar: History */}
          {showHistory && (
            <>
              <ResizablePanel defaultSize={20} minSize={15} className="hidden md:block">
                <aside className="h-full border-r border-border p-6 overflow-y-auto bg-card/30">
                  <SearchHistory history={history} onSelect={handleSelectHistory} />
                </aside>
              </ResizablePanel>
              <ResizableHandle className="w-1.5 bg-border hover:bg-primary/30 transition-colors hidden md:flex items-center justify-center">
                <div className="w-0.5 h-6 bg-border rounded-full" />
              </ResizableHandle>
            </>
          )}

          {/* Main Content: Search & Results */}
          <ResizablePanel defaultSize={showChat ? 55 : 80} minSize={30}>
            <section className="flex flex-col h-full bg-background/50">
              <div className="p-6 border-b border-border">
                <form onSubmit={handleSearch} className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search Article (e.g. Article 92), Topic (e.g. Output Floor)..."
                    className={`pl-12 py-7 bg-card border-2 ${error ? 'border-red-500 bg-red-50/10' : 'border-border'} focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground placeholder:text-muted-foreground font-sans text-base rounded-2xl shadow-sm transition-all`}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest hidden sm:block">Press Enter</span>
                    {searching && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                  </div>
                </form>
                {error && (
                  <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm animate-in fade-in slide-in-from-top-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto hover:bg-red-500/10 p-1 rounded-lg">
                      <LogOut className="w-3 h-3 rotate-45" />
                    </button>
                  </div>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div className="p-8">
                  {!currentResult && !searching ? (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto mt-20 p-10 border-2 border-dashed border-border rounded-[3rem] bg-card/20 backdrop-blur-sm">
                      <div className="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center mb-10 shadow-lg shadow-primary/5">
                        <FileText className="w-10 h-10 text-primary" />
                      </div>
                      <h2 className="text-4xl font-heading italic text-foreground mb-6">Regulatory Intelligence Engine</h2>
                      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
                        <p>
                          A professional-grade comparative framework designed to evaluate divergence between current regulatory baselines (<span className="text-foreground font-bold italic">CRR 575/2013</span>) and proposed implementation standards (<span className="text-foreground font-bold italic">PRA PS01/2026 Basel 3.1</span>).
                        </p>
                        <p className="text-xs italic opacity-80">
                          Equip stakeholders with immediate technical deltas and cross-referenced regulatory guidance to facilitate rapid decision-making.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8 text-left border-y border-border/50">
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold">01. Comparative Deltas</h4>
                            <p className="text-[11px]">Direct verbatim comparison of Article text with structured impact summaries and technical footnotes.</p>
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-mono uppercase tracking-widest text-accent font-bold">02. Strategic Briefing</h4>
                            <p className="text-[11px]">High-level synthesis for senior management focusing on capital implications and business impact.</p>
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-mono uppercase tracking-widest text-secondary font-bold">03. Interpretative Guidance</h4>
                            <p className="text-[11px]">Exhaustive retrieval of EBA Q&As and official guidance notes cross-referenced to the specific policy area.</p>
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">04. Regulatory Advisory</h4>
                            <p className="text-[11px]">AI-driven interactive consultation for complex implementation and compliance queries.</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
                        {['Article 122', 'Output Floor', 'Leverage Ratio', 'Article 92'].map(tag => (
                          <button 
                            key={tag}
                            onClick={() => { setSearchInput(tag); handleSearch(); }}
                            className="text-[11px] font-mono uppercase tracking-widest p-3 border-2 border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary hover:scale-105 active:scale-95 shadow-sm"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : searching ? (
                    <div className="space-y-8 animate-pulse">
                      <div className="space-y-4">
                        <Skeleton className="h-10 w-1/3 bg-muted" />
                        <Skeleton className="h-4 w-full bg-muted" />
                        <Skeleton className="h-4 w-full bg-muted" />
                      </div>
                      <Skeleton className="h-[400px] w-full bg-muted rounded-2xl" />
                    </div>
                  ) : (
                    <div className="space-y-12 pb-20">
                      <Tabs defaultValue="practitioner" className="w-full">
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-border pb-8 mb-12">
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <h2 className="text-3xl font-heading italic text-foreground">Analysis Engine</h2>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleExportPDF}
                                  className="h-8 rounded-lg px-3 text-[9px] uppercase tracking-widest font-bold border-2 hover:border-primary hover:text-primary transition-all flex items-center gap-2"
                                >
                                  <FileDown className="w-3.5 h-3.5" /> PDF
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleExportWord}
                                  className="h-8 rounded-lg px-3 text-[9px] uppercase tracking-widest font-bold border-2 hover:border-secondary hover:text-secondary transition-all flex items-center gap-2"
                                >
                                  <Download className="w-3.5 h-3.5" /> Word
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold opacity-60">CRR 575/2013 × PS01/2026 Comparison</p>
                          </div>
                          
                          <TabsList className="bg-muted/50 p-1 rounded-2xl border-2 border-border h-14 w-full xl:w-auto shadow-sm">
                            <TabsTrigger value="practitioner" className="rounded-xl px-8 py-2 text-[10px] uppercase tracking-widest font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground h-full transition-all">
                              Technical Intelligence
                            </TabsTrigger>
                            <TabsTrigger value="executive" className="rounded-xl px-8 py-2 text-[10px] uppercase tracking-widest font-bold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground h-full transition-all">
                              Strategic Synthesis
                            </TabsTrigger>
                          </TabsList>
                        </div>

                        <TabsContent value="practitioner" className="space-y-12 outline-none">
                          {/* Comparison Header */}
                          <div className="space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <h3 className="text-xl font-heading italic text-foreground">Comparative Policy Footnotes</h3>
                              <div className="flex flex-wrap gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setIsEditing(!isEditing)}
                                  className={`h-9 px-4 text-[10px] font-mono uppercase tracking-widest border-2 transition-all ${isEditing ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary hover:text-primary'}`}
                                >
                                  {isEditing ? 'Save Changes' : 'Edit Sources'}
                                </Button>
                                <a 
                                  href={currentResult.crrUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center rounded-xl border-2 border-border bg-card px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-all shadow-sm"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 mr-2" /> CRR Source
                                </a>
                                <a 
                                  href={currentResult.psUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center rounded-xl border-2 border-border bg-card px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-all shadow-sm"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 mr-2" /> PRA Source
                                </a>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div className="p-6 border-2 border-border rounded-2xl bg-card/50 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />
                                <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-4 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary" /> CRR Baseline
                                  </div>
                                  {isEditing && <span className="text-[9px] text-primary font-bold">EDITING</span>}
                                </h3>
                                {isEditing ? (
                                  <textarea 
                                    value={editedCrr}
                                    onChange={(e) => setEditedCrr(e.target.value)}
                                    className="w-full min-h-[350px] bg-background border-2 border-border rounded-xl p-4 text-sm font-mono text-foreground focus:border-primary outline-none transition-all resize-y"
                                  />
                                ) : (
                                  <div className="text-sm text-foreground/80 leading-relaxed font-mono whitespace-pre-wrap">
                                    {editedCrr}
                                  </div>
                                )}
                              </div>
                              <div className="p-6 border-2 border-border rounded-2xl bg-card/50 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-secondary/20" />
                                <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-4 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-secondary" /> PS01/2026 Position
                                  </div>
                                  {isEditing && <span className="text-[9px] text-secondary font-bold">EDITING</span>}
                                </h3>
                                {isEditing ? (
                                  <textarea 
                                    value={editedPs}
                                    onChange={(e) => setEditedPs(e.target.value)}
                                    className="w-full min-h-[350px] bg-background border-2 border-border rounded-xl p-4 text-sm font-mono text-foreground focus:border-primary outline-none transition-all resize-y"
                                  />
                                ) : (
                                  <div className="text-sm text-foreground/80 leading-relaxed font-mono whitespace-pre-wrap">
                                    {editedPs}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Comparison Table */}
                          <div className="space-y-6">
                            <h3 className="text-sm font-heading italic uppercase tracking-widest text-muted-foreground flex items-center gap-3">
                              <ArrowRightLeft className="w-4 h-4 text-primary" /> Structured Delta View
                            </h3>
                            <div className="rounded-2xl border-2 border-border overflow-hidden shadow-sm">
                              <RegulatoryTable rows={currentResult.comparisonTable} />
                            </div>
                          </div>

                          {/* EBA Q&As */}
                          {currentResult.ebaQas && currentResult.ebaQas.length > 0 && (
                            <div className="space-y-6">
                              <h3 className="text-sm font-heading italic uppercase tracking-widest text-muted-foreground flex items-center gap-3">
                                <ShieldCheck className="w-4 h-4 text-accent" /> Interpretative Guidance (EBA Q&As)
                              </h3>
                              <div className="space-y-4">
                                {currentResult.ebaQas.map((qa, i) => (
                                  <div key={i} className="p-6 border-2 border-border rounded-2xl bg-card/30 shadow-sm space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-mono font-bold text-accent uppercase tracking-widest">Q&A {qa.id}</span>
                                    </div>
                                    <div className="text-sm font-semibold text-foreground">
                                      {qa.question}
                                    </div>
                                    <div className="text-xs text-muted-foreground leading-relaxed bg-muted/20 p-4 rounded-xl border border-border/50">
                                      <ReactMarkdown>{qa.answer}</ReactMarkdown>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Summary & Notes */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-6">
                              <h3 className="text-sm font-heading italic uppercase tracking-widest text-muted-foreground">Technical Modifications</h3>
                              <ul className="space-y-4">
                                {currentResult.summary.map((item, i) => (
                                  <li key={i} className="flex gap-4 text-sm text-foreground/80 group">
                                    <div className="mt-1 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                                      <ChevronRight className="w-3.5 h-3.5 text-primary" />
                                    </div>
                                    <span className="leading-relaxed">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="space-y-6">
                              <h3 className="text-sm font-heading italic uppercase tracking-widest text-muted-foreground">Technical Interpretations</h3>
                              <div className="p-6 border-2 border-border rounded-2xl bg-card/50 shadow-sm space-y-5 relative">
                                <div className="absolute top-4 right-4 text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest">Expert Insights</div>
                                {currentResult.practitionerNotes.map((note, i) => (
                                  <div key={i} className="text-xs text-muted-foreground italic leading-relaxed border-l-4 border-primary/30 pl-5 py-1">
                                    {note}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="executive" className="space-y-12 outline-none">
                          {/* Executive Scorecard */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="p-8 border-2 border-border rounded-3xl bg-card shadow-lg fancy-shadow relative overflow-hidden group hover:scale-[1.02] transition-all">
                              <div className="absolute top-0 right-0 w-32 h-32 -mr-12 -mt-12 rounded-full bg-primary/5 group-hover:bg-primary/10 transition-colors" />
                              <Briefcase className="w-10 h-10 text-primary mb-8" />
                              <h4 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2 font-bold">Strategic Impact</h4>
                              <div className="text-3xl font-heading italic text-foreground">{currentResult.executiveBriefing.strategicImpact}</div>
                              <div className="mt-4 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-1000 ${
                                    currentResult.executiveBriefing.strategicImpact === 'CRITICAL' ? 'w-full bg-red-500' :
                                    currentResult.executiveBriefing.strategicImpact === 'HIGH' ? 'w-3/4 bg-orange-500' :
                                    currentResult.executiveBriefing.strategicImpact === 'MEDIUM' ? 'w-1/2 bg-amber-500' : 'w-1/4 bg-green-500'
                                  }`}
                                />
                              </div>
                            </div>

                            <div className="p-8 border-2 border-border rounded-3xl bg-card shadow-lg fancy-shadow relative overflow-hidden group hover:scale-[1.02] transition-all">
                              <div className="absolute top-0 right-0 w-32 h-32 -mr-12 -mt-12 rounded-full bg-accent/5 group-hover:bg-accent/10 transition-colors" />
                              <TrendingUp className="w-10 h-10 text-accent mb-8" />
                              <h4 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2 font-bold">Capital Impact</h4>
                              <div className="text-3xl font-heading italic text-foreground">{currentResult.executiveBriefing.capitalImpact}</div>
                              <div className="mt-4 flex items-center gap-2">
                                {currentResult.executiveBriefing.capitalImpact === 'INCREASE' ? (
                                  <AlertTriangle className="w-4 h-4 text-red-500" />
                                ) : currentResult.executiveBriefing.capitalImpact === 'DECREASE' ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                                )}
                                <span className="text-[10px] font-mono text-muted-foreground uppercase">Projected Variance</span>
                              </div>
                            </div>

                            <div className="p-8 border-2 border-border rounded-3xl bg-card shadow-lg fancy-shadow relative overflow-hidden group hover:scale-[1.02] transition-all">
                              <div className="absolute top-0 right-0 w-32 h-32 -mr-12 -mt-12 rounded-full bg-secondary/5 group-hover:bg-secondary/10 transition-colors" />
                              <BarChart3 className="w-10 h-10 text-secondary mb-8" />
                              <h4 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2 font-bold">Ops Complexity</h4>
                              <div className="text-3xl font-heading italic text-foreground">{currentResult.executiveBriefing.operationalComplexity}</div>
                              <div className="mt-4 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-1000 ${
                                    currentResult.executiveBriefing.operationalComplexity === 'HIGH' ? 'w-full bg-red-500' :
                                    currentResult.executiveBriefing.operationalComplexity === 'MEDIUM' ? 'w-1/2 bg-amber-500' : 'w-1/4 bg-green-500'
                                  }`}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Management Summary */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            <div className="space-y-8">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                                  <CheckCircle2 className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="text-xl font-heading italic text-foreground">Key Takeaways</h3>
                              </div>
                              <div className="space-y-6">
                                {currentResult.executiveBriefing.keyTakeaways.map((point, i) => (
                                  <div key={i} className="flex gap-6 group">
                                    <div className="text-2xl font-heading italic text-primary/20 group-hover:text-primary/40 transition-colors">0{i + 1}</div>
                                    <div className="text-base text-foreground/80 leading-relaxed pt-1">{point}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-8">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
                                  <Briefcase className="w-6 h-6 text-accent" />
                                </div>
                                <h3 className="text-xl font-heading italic text-foreground">Business Implications</h3>
                              </div>
                              <div className="p-10 border-2 border-border rounded-[2.5rem] bg-card/50 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-2 h-full bg-accent/20" />
                                <div className="text-lg text-foreground/90 leading-relaxed italic font-heading">
                                  "{currentResult.executiveBriefing.businessImplications}"
                                </div>
                                <div className="mt-8 pt-8 border-t border-border flex items-center justify-between">
                                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Strategic Advisory Note</div>
                                  <div className="flex gap-1">
                                    {[1, 2, 3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent/30" />)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </section>
          </ResizablePanel>

          {/* Right Sidebar: AI Chat */}
          {showChat && (
            <>
              <ResizableHandle className="w-1.5 bg-border hover:bg-primary/30 transition-colors hidden md:flex items-center justify-center">
                <div className="w-0.5 h-6 bg-border rounded-full" />
              </ResizableHandle>
              <ResizablePanel defaultSize={25} minSize={20} className="hidden md:flex">
                <aside className="h-full border-l border-border flex flex-col bg-card/20 w-full overflow-hidden">
                  <div className="p-6 border-b border-border flex items-center justify-between bg-card/40 shrink-0">
                    <h3 className="font-heading italic text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" /> Regulatory Assistant
                    </h3>
                    <button 
                      onClick={() => setShowChat(false)}
                      className="p-1 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
                    >
                      <LogOut className="w-3 h-3 rotate-180" />
                    </button>
                  </div>

                  <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
                    <div className="p-6 space-y-8">
                      {chatMessages.length === 0 && (
                        <div className="text-center py-12 px-4">
                          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <MessageSquare className="w-6 h-6 text-primary" />
                          </div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-3 font-bold">AI Analysis Engine</p>
                          <p className="text-xs text-muted-foreground italic leading-relaxed">
                            Ask complex questions about the regulatory impact, implementation timelines, or cross-article dependencies.
                          </p>
                        </div>
                      )}
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            msg.role === 'user' 
                              ? 'bg-primary text-primary-foreground rounded-tr-none' 
                              : 'bg-card border-2 border-border text-foreground rounded-tl-none'
                          }`}>
                            <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-indigo'}`}>
                              <ReactMarkdown>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground mt-2 uppercase font-mono font-bold tracking-tight">
                            {msg.role === 'user' ? 'Practitioner' : 'Gemini AI'}
                          </span>
                        </div>
                      ))}
                      {analyzing && (
                        <div className="flex items-center gap-3 text-[11px] text-primary font-mono italic font-bold">
                          <Loader2 className="w-4 h-4 animate-spin" /> Analyzing context...
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="p-5 border-t border-border bg-card/80 backdrop-blur-md shrink-0">
                    <form onSubmit={handleChat} className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input 
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type your question..."
                          className="pr-12 bg-background border-2 border-border text-sm h-12 rounded-xl focus:border-primary transition-all shadow-md w-full"
                        />
                        <button 
                          type="submit"
                          disabled={analyzing || !chatInput.trim()}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-primary hover:text-primary/80 disabled:opacity-30 transition-all hover:scale-110 active:scale-90 bg-primary/10 rounded-lg"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </form>
                    <p className="text-[9px] text-muted-foreground text-center mt-3 uppercase tracking-tighter font-mono">
                      AI may provide inaccurate info. Verify with sources.
                    </p>
                  </div>
                </aside>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
