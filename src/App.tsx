import React, { useEffect, useState } from 'react';
import debounce from 'lodash/debounce';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  BookOpen, 
  FileQuestion, 
  UserCircle, 
  Award,
  ChevronRight,
  Download,
  Printer,
  RotateCcw,
  Settings,
  LogOut,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Users,
  ArrowUp,
  ArrowDown,
  FileDown,
  Image,
  Video
} from 'lucide-react';
import confetti from 'canvas-confetti';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './lib/firebase';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  setDoc, 
  addDoc, 
  deleteDoc,
  updateDoc,
  getDoc,
  limit
} from 'firebase/firestore';
import { User } from 'firebase/auth';

// --- TYPES ---
type Step = 'learning' | 'quiz' | 'form' | 'certificate' | 'admin';

interface UserInfo {
  firstName: string;
  lastName: string;
  institution: string;
  date: string;
}

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
}

interface ContentBlock {
  id: string;
  type: 'text' | 'image' | 'video';
  value: string;
}

interface TrainingData {
  title: string;
  description: string;
  textContent: string;
  contentBlocks?: ContentBlock[];
}

interface UserResult extends UserInfo {
  id: string;
  uid: string;
  timestamp: string;
}

// --- COMPONENTS ---

const NavigationSteps = ({ currentStep }: { currentStep: Step }) => {
  const steps = [
    { key: 'learning', label: 'Formation', icon: BookOpen },
    { key: 'quiz', label: 'Evaluation', icon: FileQuestion },
    { key: 'form', label: 'Coordonnées', icon: UserCircle },
    { key: 'certificate', label: 'Certificat', icon: Award },
  ];

  return (
    <div className="flex items-center justify-start md:justify-center space-x-4 md:space-x-8 mb-12 overflow-x-auto py-4 scrollbar-hide">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isActive = step.key === currentStep;
        const isPast = ['learning', 'quiz', 'form', 'certificate'].indexOf(currentStep as any) > idx && currentStep !== 'admin';

        return (
          <div key={step.key} className="flex items-center">
            <div className={`flex flex-col items-center space-y-2 transition-all duration-300 ${isActive || isPast ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 shadow-sm ${
                isActive ? 'border-blue-600 bg-blue-50' : 
                isPast ? 'border-green-500 bg-green-50' : 'border-gray-200'
              }`}>
                {isPast ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <Icon className="w-5 h-5" />}
              </div>
              <span className="text-xs font-medium uppercase tracking-wider hidden md:block">{step.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`h-px w-8 md:w-16 mx-2 md:mx-4 ${isPast ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

const Header = ({ 
  user, 
  onLogin, 
  onLogout, 
  isAdmin, 
  onAdminClick 
}: { 
  user: User | null, 
  onLogin: () => void, 
  onLogout: () => void, 
  isAdmin: boolean,
  onAdminClick: () => void
}) => (
  <header className="py-6 px-6 md:px-12 flex items-center justify-between border-b border-gray-100 bg-white/95 backdrop-blur-md sticky top-0 z-[100] shadow-sm">
    <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => window.location.reload()}>
      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform">
        <Award className="text-white w-6 h-6" />
      </div>
      <div className="hidden sm:block">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none group-hover:text-blue-600 transition-colors">Infirmière<span className="text-blue-600">Pro</span></h1>
        <p className="text-gray-400 text-[10px] uppercase font-black tracking-widest mt-1">Plateforme Clinique de Certification</p>
      </div>
    </div>

    <div className="flex items-center space-x-2 md:space-x-4">
      {isAdmin && (
        <button 
          onClick={onAdminClick}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
          title="Panneau d'administration"
        >
          <Settings className="w-5 h-5" />
        </button>
      )}
      
      {!user ? (
        <button 
          onDoubleClick={onLogin}
          className="w-4 h-4 rounded-full opacity-0 hover:opacity-10 transition-opacity bg-blue-600 cursor-default"
          title=""
        >
          <span className="sr-only">Admin Access</span>
        </button>
      ) : (
        <div className="flex items-center space-x-3 bg-gray-50 p-1.5 rounded-full pl-3 hover:bg-gray-100 transition-colors border border-gray-200">
          <span className="text-xs font-bold text-gray-700 hidden md:block">{user.displayName || 'Étudiant'}</span>
          <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="Profile" className="w-8 h-8 rounded-full border-2 border-white" />
          <button onClick={onLogout} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  </header>
);

export default function App() {
  const [step, setStep] = useState<Step>('learning');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [training, setTraining] = useState<TrainingData>({
    title: "L'Hygiène des Mains : Protocoles & Pratiques",
    description: "Ce module traite de l'importance cruciale de l'hygiène des mains en milieu de soins pour prévenir les infections associées aux soins (IAS).",
    textContent: "Le lavage des mains est un geste simple mais vital. \n\nIl existe trois niveaux d'hygiène des mains en milieu hospitalier :\n1. Le lavage simple (eau + savon doux)\n2. La désinfection chirurgicale\n3. La friction hydro-alcoolique (FHA)\n\nLa FHA est désormais la technique de référence car elle est plus rapide, plus efficace et mieux tolérée par la peau.",
    contentBlocks: [
      {
        id: 'default-text',
        type: 'text',
        value: "Le lavage des mains est un geste simple mais vital. \n\nIl existe trois niveaux d'hygiène des mains en milieu hospitalier :\n1. Le lavage simple (eau + savon doux)\n2. La désinfection chirurgicale\n3. La friction hydro-alcoolique (FHA)\n\nLa FHA est désormais la technique de référence car elle est plus rapide, plus efficace et mieux tolérée par la peau."
      }
    ]
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo>({
    firstName: '',
    lastName: '',
    institution: '',
    date: ''
  });

  // Auth & Data fetching
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        // Check admin role
        try {
          const adminDoc = await getDoc(doc(db, 'admins', u.uid));
          setIsAdmin(adminDoc.exists() || u.email === 'logique901@gmail.com');
        } catch (e) {
          setIsAdmin(u.email === 'logique901@gmail.com');
        }
      } else {
        setIsAdmin(false);
      }
    });

    const unsubTraining = onSnapshot(doc(db, 'config', 'training'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as TrainingData;
        if (!data.contentBlocks && data.textContent) {
          data.contentBlocks = [{ id: Date.now().toString(), type: 'text', value: data.textContent }];
        } else if (!data.contentBlocks) {
          data.contentBlocks = [];
        }
        setTraining(data);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'config/training'));

    // Fetch questions
    const q = query(collection(db, 'questions'), orderBy('order', 'asc'));
    const unsubQuestions = onSnapshot(q, (snapshot) => {
      const qData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      setQuestions(qData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'questions'));

    return () => {
      unsubAuth();
      unsubTraining();
      unsubQuestions();
    };
  }, []);

  const handleQuizSuccess = () => {
    setStep('form');
  };

  const handleFormSubmit = async (info: UserInfo) => {
    setUserInfo(info);
    if (user) {
      try {
        await addDoc(collection(db, 'results'), {
          ...info,
          uid: user.uid,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'results');
      }
    }
    setStep('certificate');
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#2563eb', '#10b981', '#fbbf24']
    });
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const downloadCertificate = async () => {
    const element = document.getElementById('certificate-print');
    if (!element) return;

    setIsDownloading(true);
    try {
      const dataUrl = await htmlToImage.toPng(element, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [width * 2, height * 2]
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, width * 2, height * 2);
      pdf.save(`Certificat-${userInfo.firstName}-${userInfo.lastName}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erreur lors de la génération du PDF. Vous pouvez toujours utiliser le bouton Imprimer.');
    } finally {
      setIsDownloading(false);
    }
  };

  const reset = () => {
    setStep('learning');
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-white space-y-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Chargement sécurisé...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-gray-900 font-sans selection:bg-blue-100">
      <Header 
        user={user} 
        onLogin={signInWithGoogle} 
        onLogout={logout} 
        isAdmin={isAdmin}
        onAdminClick={() => setStep('admin')}
      />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-20 pt-6 sm:pt-10">
        {step !== 'admin' && <NavigationSteps currentStep={step} />}

        <AnimatePresence mode="wait">
          {step === 'learning' && (
            <motion.div
              key="learning"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="bg-white rounded-3xl p-8 shadow-xl shadow-gray-100 border border-gray-100"
            >
              <div className="mb-8">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full mb-4 uppercase tracking-widest tracking-[0.2em]">Module 01</span>
                <h2 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">{training.title}</h2>
                <p className="text-gray-600 leading-relaxed max-w-2xl">
                  {training.description}
                </p>
              </div>

              <div className="prose prose-blue max-w-none mb-10 text-gray-700 space-y-8">
                {training.contentBlocks?.map(block => {
                  if (block.type === 'text') {
                    return (
                      <div key={block.id} className="whitespace-pre-wrap leading-loose font-medium text-gray-600">
                        {block.value}
                      </div>
                    );
                  }
                  if (block.type === 'image') {
                    return (
                      <img key={block.id} src={block.value} alt="Illustration" className="w-full rounded-2xl shadow-md" />
                    );
                  }
                  if (block.type === 'video') {
                    // Make youtube links embeddable
                    let videoUrl = block.value;
                    if (videoUrl.includes('youtube.com/watch?v=')) {
                      videoUrl = videoUrl.replace('watch?v=', 'embed/').split('&')[0];
                    } else if (videoUrl.includes('youtu.be/')) {
                      videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/').split('?')[0];
                    }
                    
                    return (
                      <div key={block.id} className="aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl relative">
                        {videoUrl.includes('youtube.com/embed') ? (
                          <iframe src={videoUrl} className="absolute inset-0 w-full h-full border-0" allowFullScreen />
                        ) : (
                          <video src={videoUrl} controls className="absolute inset-0 w-full h-full object-contain bg-black" />
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              <div className="flex justify-end pt-8 border-t border-gray-50">
                <button 
                  onClick={() => setStep('quiz')}
                  className="px-8 py-4 bg-gray-900 text-white font-bold rounded-2xl flex items-center space-x-2 hover:bg-black transition-all shadow-lg hover:shadow-xl active:scale-[0.98] group"
                >
                  <span>Passer au Quiz</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'quiz' && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 max-w-2xl mx-auto"
            >
              {questions.length > 0 ? (
                <QuizModule 
                  onComplete={handleQuizSuccess} 
                  questions={questions} 
                  onReview={() => setStep('learning')}
                />
              ) : (
                <div className="text-center py-12">
                   <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                   <p className="text-gray-500">Aucune question configurée.</p>
                   {isAdmin && (
                     <button onClick={() => setStep('admin')} className="mt-4 text-blue-600 font-bold underline">Ajouter des questions</button>
                   )}
                </div>
              )}
            </motion.div>
          )}

          {step === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 max-w-xl mx-auto"
            >
              <SuccessForm onSubmit={handleFormSubmit} initialUser={user} />
            </motion.div>
          )}

          {step === 'certificate' && (
            <motion.div
              key="certificate"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
                <div className="relative z-10 text-center md:text-left">
                  <h2 className="text-3xl font-bold mb-2 tracking-tight">Félicitations, {userInfo.firstName} !</h2>
                  <p className="text-blue-100 max-w-md">Validation réussie. Vous pouvez imprimer votre certificat ci-dessous.</p>
                </div>
                <div className="flex flex-wrap gap-4 relative z-10 w-full md:w-auto">
                  <button 
                    onClick={downloadCertificate} 
                    disabled={isDownloading}
                    className="flex-1 md:flex-none px-6 py-3 bg-white text-blue-600 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-blue-50 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
                    <span>{isDownloading ? 'Génération...' : 'PDF'}</span>
                  </button>
                  <button onClick={() => window.print()} className="flex-1 md:flex-none px-6 py-3 bg-white/20 text-white border border-white/30 backdrop-blur-sm rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-white/30 transition-all shadow-lg active:scale-95">
                    <Printer className="w-5 h-5" />
                    <span>Imprimer</span>
                  </button>
                  <button onClick={reset} className="flex-1 md:flex-none px-6 py-3 bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-blue-400 transition-all shadow-lg active:scale-95">
                    <RotateCcw className="w-5 h-5" />
                    <span>Accueil</span>
                  </button>
                </div>
                <Award className="absolute -right-16 -bottom-16 w-64 h-64 text-blue-500/20 rotate-12" />
              </div>
              
              <CertificateDisplay info={userInfo} trainingTitle={training.title} />
            </motion.div>
          )}

          {step === 'admin' && isAdmin && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <AdminPanel 
                training={training} 
                questions={questions} 
                onClose={() => setStep('learning')} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-12 border-t border-gray-100 text-center bg-white mt-12 print:hidden">
        <p className="text-gray-400 text-xs font-black uppercase tracking-[0.3em]">© 2026 Académie des Sciences Infirmières</p>
      </footer>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function QuizModule({ onComplete, questions, onReview }: { onComplete: () => void, questions: Question[], onReview: () => void }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [quizState, setQuizState] = useState<'intro' | 'responding' | 'result'>('intro');

  const q = questions[currentIdx];
  const progress = ((currentIdx + (quizState === 'result' ? 1 : 0)) / questions.length) * 100;

  const handleNext = () => {
    if (selected === null) return;
    const newAnswers = [...answers, selected];
    setAnswers(newAnswers);
    setSelected(null);

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setQuizState('result');
    }
  };

  const calculateScore = () => {
    return answers.reduce((acc, ans, i) => acc + (ans === questions[i].correctAnswer ? 1 : 0), 0);
  };

  const score = calculateScore();
  const isSuccess = score === questions.length;
  const missedIndices = answers.map((ans, i) => ans !== questions[i].correctAnswer ? i : -1).filter(i => i !== -1);

  const handleRetry = () => {
    setCurrentIdx(0);
    setAnswers([]);
    setSelected(null);
    setQuizState('responding');
  };

  if (quizState === 'intro') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-6 space-y-8"
      >
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <FileQuestion className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Prêt pour l'évaluation ?</h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Cette évaluation comporte <strong>{questions.length} questions</strong>. Pour obtenir votre certificat, vous devez répondre correctement à <strong>toutes les questions (100%)</strong>.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 text-left max-w-xs mx-auto">
          {[
            "Vérifiez vos connaissances théoriques",
            "Pas de limite de temps",
            "Tentatives illimitées"
          ].map((item, i) => (
            <div key={i} className="flex items-center space-x-3 text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
               <CheckCircle2 className="w-4 h-4 text-green-500" />
               <span className="font-semibold">{item}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setQuizState('responding')}
          className="px-10 py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl active:scale-95 w-full max-w-xs mx-auto"
        >
          Démarrer le Quiz
        </button>
      </motion.div>
    );
  }

  if (quizState === 'result') {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="py-4 space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto border-4 ${isSuccess ? 'border-green-500 bg-green-50 text-green-600' : 'border-red-400 bg-red-50 text-red-500'}`}>
              {isSuccess ? <Award className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 mb-1">
              {isSuccess ? "Félicitations !" : "Échec de validation"}
            </h2>
            <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">
              Score : {score} sur {questions.length}
            </p>
          </div>
        </div>

        {!isSuccess && (
          <div className="bg-red-50/50 rounded-2xl p-6 border border-red-100 space-y-4">
            <h4 className="text-xs font-black text-red-600 uppercase tracking-[0.1em] border-b border-red-100 pb-3">Points à réviser :</h4>
            <div className="space-y-3">
              {missedIndices.map(idx => (
                <div key={idx} className="flex items-start space-x-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">{idx + 1}</div>
                  <p className="text-sm text-red-700 font-medium leading-snug">{questions[idx].text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {isSuccess ? (
            <button
              onClick={onComplete}
              className="w-full px-10 py-5 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center space-x-2"
            >
              <span>Continuer vers le Certificat</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <>
              <button
                onClick={handleRetry}
                className="flex-1 px-8 py-5 bg-gray-900 text-white rounded-2xl font-bold shadow-lg hover:bg-black transition-all flex items-center justify-center space-x-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Réessayer</span>
              </button>
              <button
                onClick={onReview}
                className="flex-1 px-8 py-5 bg-white text-gray-600 border border-gray-200 rounded-2xl font-bold hover:bg-gray-50 transition-all"
              >
                Revoir le cours
              </button>
            </>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Progress Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Progression de l'examen</span>
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{currentIdx + 1} / {questions.length}</span>
        </div>
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className="h-full bg-blue-600 rounded-full"
          />
        </div>
      </div>

      <div className="flex flex-col border-b border-gray-50 pb-6">
        <h3 className="text-2xl font-bold text-gray-900 tracking-tight leading-tight">{q.text}</h3>
      </div>

      <div className="space-y-3">
        {q.options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => setSelected(idx)}
            className={`w-full p-5 rounded-2xl text-left border-2 transition-all duration-200 flex items-center justify-center space-x-4 group h-full leading-snug cursor-pointer ${
              selected === idx 
                ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md transform -translate-y-0.5' 
                : 'border-gray-50 hover:border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className={`w-8 h-8 rounded-xl border flex-shrink-0 flex items-center justify-center font-bold text-xs transition-all ${
              selected === idx ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-100 text-gray-400 group-hover:border-gray-200'
            }`}>
              {String.fromCharCode(65 + idx)}
            </div>
            <span className="flex-1 font-semibold text-lg">{opt}</span>
            <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 transition-all ${
              selected === idx ? 'border-blue-600 bg-blue-600 shadow-lg shadow-blue-200' : 'border-gray-100'
            }`}>
              {selected === idx && <CheckCircle2 className="w-full h-full text-white p-1" />}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={handleNext}
        disabled={selected === null}
        className={`w-full py-5 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center space-x-2 ${
          selected !== null 
            ? 'bg-gray-900 text-white hover:bg-black active:scale-95' 
            : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
        }`}
      >
        <span>{currentIdx === questions.length - 1 ? "Valider le Quiz" : "Question Suivante"}</span>
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function SuccessForm({ onSubmit, initialUser }: { onSubmit: (info: UserInfo) => void, initialUser: User | null }) {
  const [formData, setFormData] = useState({
    firstName: initialUser?.displayName?.split(' ')[0] || '',
    lastName: initialUser?.displayName?.split(' ').slice(1).join(' ') || '',
    institution: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.institution) return;
    onSubmit({
      ...formData,
      date: format(new Date(), 'dd MMMM yyyy', { locale: fr })
    });
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-100">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">Certification</h2>
        <p className="text-gray-500 max-w-sm mx-auto">Veuillez confirmer vos informations pour le diplôme.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Prénom</label>
              <input
                required
                type="text"
                className="w-full px-5 py-4 bg-gray-50 border-gray-100 rounded-2xl border-2 focus:border-blue-600 focus:bg-white transition-all outline-none font-semibold shadow-sm"
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Nom</label>
              <input
                required
                type="text"
                className="w-full px-5 py-4 bg-gray-50 border-gray-100 rounded-2xl border-2 focus:border-blue-600 focus:bg-white transition-all outline-none font-semibold shadow-sm"
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Établissement / IFSI</label>
            <input
              required
              type="text"
              className="w-full px-5 py-4 bg-gray-50 border-gray-100 rounded-2xl border-2 focus:border-blue-600 focus:bg-white transition-all outline-none font-semibold shadow-sm"
              value={formData.institution}
              onChange={e => setFormData({ ...formData, institution: e.target.value })}
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-[0.98] flex items-center justify-center space-x-2"
        >
          <span>Générer mon Diplôme</span>
          <Download className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}

function CertificateDisplay({ info, trainingTitle }: { info: UserInfo, trainingTitle: string }) {
  return (
    <div className="flex justify-center w-full overflow-x-auto py-8 scrollbar-hide">
      <div 
        id="certificate-print"
        style={{
          fontFamily: "'Georgia', serif",
          width: '800px',
          minWidth: '800px',
          height: '560px',
          padding: '12px',
          backgroundColor: '#f4f4f4',
          boxSizing: 'border-box',
          position: 'relative'
        }}
      >
        <div style={{
          backgroundColor: '#fdfdfd',
          border: '12px solid #1b365d',
          boxShadow: 'inset 0 0 0 6px #fdfdfd, inset 0 0 0 8px #d4af37',
          padding: '24px',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
        }}>
          <div style={{
            height: '100%',
            padding: '10px 20px',
            boxSizing: 'border-box',
            textAlign: 'center',
            position: 'relative'
          }}>
            <div style={{ marginTop: '10px' }}>
              <div style={{
                fontFamily: "'Arial', sans-serif",
                fontSize: '11.5px',
                color: '#1b365d',
                letterSpacing: '0.5px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                lineHeight: '1.4'
              }}>
                Support Pédagogique pour Manipulateurs de Radiologie<br/>de l'Hôpital Mahmoud El Matri
              </div>
              
              <div style={{ color: '#d4af37', fontSize: '18px', margin: '8px 0', letterSpacing: '4px' }}>★ ★ ★</div>
              
              <h1 style={{
                color: '#1b365d',
                fontSize: '34px',
                margin: '10px 0 5px 0',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 'bold',
                fontFamily: "'Georgia', serif"
              }}>Attestation de Réussite</h1>
              
              <h2 style={{
                color: '#d4af37',
                fontSize: '16px',
                margin: '0 0 25px 0',
                fontStyle: 'italic',
                fontWeight: 'normal',
                fontFamily: "'Georgia', serif"
              }}>Programme Indépendant de Formation "RF-Flash"</h2>

              <div style={{
                fontSize: '15px',
                lineHeight: '1.8',
                color: '#333',
                margin: '10px auto',
                maxWidth: '650px',
                fontFamily: "'Georgia', serif"
              }}>
                Il est certifié avec honneur que le/la Technicien(ne) en Imagerie Médicale<br/>
                <div style={{
                  fontSize: '26px',
                  fontWeight: 'bold',
                  color: '#1b365d',
                  display: 'block',
                  margin: '12px 0 10px 0',
                  fontFamily: "'Georgia', serif",
                  letterSpacing: '0.5px'
                }}>
                  {info.firstName} {info.lastName}
                </div>
                a complété avec succès le module de formation autonome et validé l'évaluation sur la<br/>
                <strong style={{ color: '#333', fontSize: '16px' }}>Radiofréquence Hépatique sous Scanner.</strong>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '45px',
              padding: '0 40px'
            }}>
              <div style={{ width: '250px', textAlign: 'left', fontSize: '12px', color: '#333' }}>
                <div style={{ fontStyle: 'italic', color: '#c5a059', fontSize: '11px', marginBottom: '2px' }}>[Scan Signature]</div>
                <div style={{ height: '40px', width: '100%', position: 'relative', overflow: 'visible' }}>
                  <svg viewBox="0 0 150 50" style={{ height: '110%', position: 'absolute', top: '-5px', left: '-15px', opacity: 0.85 }}>
                    <path d="M40,35 C30,15 45,5 50,35 C65,15 70,30 80,30 C85,30 90,20 95,30 C100,20 105,30 115,30 M30,30 L55,25 M45,45 C50,45 60,40 70,40 C80,45 90,40 100,45" fill="none" stroke="#1b365d" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{ borderTop: '1px solid #1b365d', paddingTop: '6px' }}>
                  <span style={{ fontWeight: 'bold', color: '#1b365d', fontSize: '13px' }}>Nour KCHAOU</span><br/>
                  <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic', lineHeight: '1.4' }}>Étudiante en Imagerie Médicale<br/>et Radiothérapie</span>
                </div>
              </div>

              <div style={{ width: '250px', textAlign: 'left', fontSize: '12px', color: '#333' }}>
                <div style={{ fontStyle: 'italic', color: '#c5a059', fontSize: '11px', marginBottom: '2px' }}>[Scan Signature]</div>
                <div style={{ height: '40px', width: '100%', position: 'relative', overflow: 'visible' }}>
                  <svg viewBox="0 0 150 50" style={{ height: '115%', position: 'absolute', top: '-8px', left: '-10px', opacity: 0.85 }}>
                    <path d="M35,10 L40,40 M40,30 L50,15 C60,25 65,15 70,30 C75,10 80,30 85,40 C95,15 100,5 105,30 C110,20 115,10 120,25 L120,40 M110,40 L130,40 M80,25 L90,25" fill="none" stroke="#1b365d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ borderTop: '1px solid #1b365d', paddingTop: '6px' }}>
                  <span style={{ fontWeight: 'bold', color: '#1b365d', fontSize: '13px' }}>Wissal KHALIL</span><br/>
                  <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic', lineHeight: '1.4' }}>Étudiante en Imagerie Médicale<br/>et Radiothérapie</span>
                </div>
              </div>
            </div>

            <div style={{
              position: 'absolute',
              bottom: '15px',
              left: '20px',
              fontSize: '9.5px',
              color: '#555',
              fontFamily: "'Arial', sans-serif",
              textAlign: 'left',
              lineHeight: '1.4'
            }}>
              <strong style={{ color: '#333' }}>Réf :</strong> RF-FLASH/2026<br/>
              <strong style={{ color: '#333' }}>Date :</strong> {info.date || new Date().toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #certificate-print, #certificate-print * { visibility: visible; }
          #certificate-print {
            position: absolute; left: 0; top: 0;
            margin: 0;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          @page { size: landscape; margin: 0; }
        }
      `}</style>
    </div>
  );
}

function QuestionEditor({ 
  q, 
  qIdx, 
  total, 
  moveQuestion, 
  deleteQuestion, 
  onSave 
}: { 
  key?: string | number;
  q: Question; 
  qIdx: number; 
  total: number; 
  moveQuestion: (idx: number, dir: 'up' | 'down') => void; 
  deleteQuestion: (id: string) => void;
  onSave: (id: string, updates: Partial<Question>) => Promise<void>;
}) {
  const [localQ, setLocalQ] = useState(q);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setLocalQ(q);
    }
  }, [q, isDirty]);

  const debouncedSave = React.useMemo(
    () => debounce(async (id: string, updates: Partial<Question>) => {
      try {
        await onSave(id, updates);
      } finally {
        setIsDirty(false);
      }
    }, 1000),
    [onSave]
  );

  const updateField = (updates: Partial<Question>) => {
    setIsDirty(true);
    setLocalQ(prev => ({ ...prev, ...updates }));
    debouncedSave(q.id, updates);
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-6 relative group mt-8 sm:mt-0">
      <div className="absolute -top-4 right-4 sm:top-6 sm:right-6 flex items-center space-x-1 sm:space-x-2 bg-white sm:bg-transparent rounded-xl shadow-sm sm:shadow-none border border-gray-100 sm:border-transparent p-1 sm:p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all z-10">
        <button 
          onClick={() => moveQuestion(qIdx, 'up')}
          disabled={qIdx === 0}
          className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-600 disabled:opacity-30 bg-white sm:bg-transparent rounded-md"
        >
          <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
        <button 
          onClick={() => moveQuestion(qIdx, 'down')}
          disabled={qIdx === total - 1}
          className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-600 disabled:opacity-30 bg-white sm:bg-transparent rounded-md"
        >
          <ArrowDown className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
        <button 
          onClick={() => deleteQuestion(q.id)}
          className="p-1.5 sm:p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
        >
          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
      </div>
      
      <div className="space-y-2">
        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Question {qIdx + 1}</label>
        <input 
          className="w-full px-4 py-3 bg-white border-gray-100 rounded-xl border focus:border-blue-500 transition-all outline-none font-bold"
          value={localQ.text}
          onChange={e => updateField({ text: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {localQ.options.map((opt, oIdx) => (
          <div key={oIdx} className="space-y-1">
            <div className="flex items-center justify-between px-1">
              <label className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Option {oIdx + 1}</label>
              <input 
                type="radio" 
                name={`correct-${localQ.id}`}
                checked={localQ.correctAnswer === oIdx}
                onChange={() => updateField({ correctAnswer: oIdx })}
                className="w-3 h-3 accent-blue-600"
              />
            </div>
            <input 
              className={`w-full px-4 py-2.5 bg-white border-gray-100 rounded-xl border focus:border-blue-500 transition-all outline-none text-xs font-bold ${localQ.correctAnswer === oIdx ? 'ring-2 ring-blue-500/20 bg-blue-50/10' : ''}`}
              value={opt}
              onChange={e => {
                const newOpts = [...localQ.options];
                newOpts[oIdx] = e.target.value;
                updateField({ options: newOpts });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminPanel({ training, questions, onClose }: { training: TrainingData, questions: Question[], onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'content' | 'quiz' | 'results'>('content');
  const [tData, setTData] = useState(training);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<UserResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    if (activeTab === 'results') {
      const qResults = query(collection(db, 'results'), orderBy('timestamp', 'desc'), limit(100));
      const unsubscribe = onSnapshot(qResults, (snapshot) => {
        setResults(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserResult)));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'results'));
      return unsubscribe;
    }
  }, [activeTab]);

  const handleFileUpload = (file: File, blockId: string, idx: number) => {
    if (!file) return;

    if (file.size > 1048576) {
      alert("Attention : Le fichier dépasse 1 Mo. La sauvegarde risque d'échouer car la base de données limite la taille du document. Veuillez utiliser des fichiers de petite taille ou fournir une URL directement.");
    }

    setUploadProgress(prev => ({ ...prev, [blockId]: 50 }));

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target?.result as string;
      const newBlocks = [...(tData.contentBlocks || [])];
      newBlocks[idx] = { ...newBlocks[idx], value: base64String };
      setTData({ ...tData, contentBlocks: newBlocks });
      
      setUploadProgress(prev => {
        const newProg = { ...prev };
        delete newProg[blockId];
        return newProg;
      });
    };
    reader.onerror = (error) => {
      console.error("Upload failed", error);
      alert("Erreur lors de la conversion du fichier.");
      setUploadProgress(prev => {
        const newProg = { ...prev };
        delete newProg[blockId];
        return newProg;
      });
    };
    reader.readAsDataURL(file);
  };

  const saveTraining = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'training'), tData);
      alert("✅ Module de formation mis à jour avec succès !");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'config/training');
    }
    setSaving(false);
  };

  const deleteResult = async (id: string) => {
    if (!confirm("⚠️ Cette action supprimera définitivement le certificat de l'étudiant. Continuer ?")) return;
    try {
      await deleteDoc(doc(db, 'results', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `results/${id}`);
    }
  };

  const addQuestion = async () => {
    const newQ = {
      text: "Nouvelle Question ?",
      options: ["Choix A", "Choix B", "Choix C", "Choix D"],
      correctAnswer: 0,
      order: questions.length
    };
    try {
      await addDoc(collection(db, 'questions'), newQ);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'questions');
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Supprimer ?")) return;
    try {
      await deleteDoc(doc(db, 'questions', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `questions/${id}`);
    }
  };

  const updateQuestion = async (id: string, updates: Partial<Question>) => {
    try {
      await updateDoc(doc(db, 'questions', id), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `questions/${id}`);
    }
  };

  const moveQuestion = async (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;

    const currentQ = questions[index];
    const targetQ = questions[targetIdx];

    try {
      await updateDoc(doc(db, 'questions', currentQ.id), { order: targetIdx });
      await updateDoc(doc(db, 'questions', targetQ.id), { order: index });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'questions (reorder)');
    }
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden min-h-[600px] flex flex-col">
      <div className="p-4 sm:p-8 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-baseline sm:items-center justify-center text-white shadow-lg p-2 sm:p-0">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight leading-none">Administration</h2>
            <p className="text-gray-400 text-[9px] sm:text-[10px] font-black uppercase tracking-widest mt-1.5 line-clamp-1">Gestion des ressources</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="px-4 sm:px-6 py-2 sm:py-2.5 bg-gray-50 text-gray-600 rounded-xl text-xs sm:text-sm font-bold hover:bg-gray-100 transition-colors border border-gray-100 whitespace-nowrap ml-2"
        >
          Fermer
        </button>
      </div>

      <div className="flex border-b border-gray-50 overflow-x-auto">
        {[
          { id: 'content', label: 'Formation', icon: BookOpen },
          { id: 'quiz', label: 'Questions', icon: FileQuestion },
          { id: 'results', label: 'Résultats', icon: Users },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-4 px-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 flex items-center justify-center space-x-2 whitespace-nowrap min-w-max ${activeTab === tab.id ? 'text-blue-600 border-blue-600 bg-blue-50/30' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
          >
            <tab.icon className="w-3 h-3" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-8 flex-1 overflow-y-auto max-h-[70vh]">
        {activeTab === 'content' && (
          <div className="space-y-6 max-w-2xl mx-auto pb-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Titre du Module</label>
              <input 
                className="w-full px-5 py-4 bg-gray-50 border-gray-100 rounded-2xl border-2 focus:border-blue-600 focus:bg-white transition-all outline-none font-bold text-lg"
                value={tData.title}
                onChange={e => setTData({...tData, title: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Description</label>
              <textarea 
                rows={3}
                className="w-full px-5 py-4 bg-gray-50 border-gray-100 rounded-2xl border-2 focus:border-blue-600 focus:bg-white transition-all outline-none font-medium text-sm"
                value={tData.description}
                onChange={e => setTData({...tData, description: e.target.value})}
              />
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Contenu (Blocs)</label>
              
              <div className="space-y-6">
                {tData.contentBlocks?.map((block, idx) => (
                  <div key={block.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 relative group">
                    <div className="absolute -top-3 -right-3 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          const newBlocks = [...(tData.contentBlocks || [])];
                          if (idx > 0) {
                            [newBlocks[idx - 1], newBlocks[idx]] = [newBlocks[idx], newBlocks[idx - 1]];
                            setTData({...tData, contentBlocks: newBlocks});
                          }
                        }}
                        disabled={idx === 0}
                        className="p-1.5 bg-white border border-gray-100 text-gray-500 hover:text-blue-600 rounded-lg shadow-sm disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => {
                          const newBlocks = [...(tData.contentBlocks || [])];
                          if (idx < newBlocks.length - 1) {
                            [newBlocks[idx + 1], newBlocks[idx]] = [newBlocks[idx], newBlocks[idx + 1]];
                            setTData({...tData, contentBlocks: newBlocks});
                          }
                        }}
                        disabled={idx === (tData.contentBlocks?.length || 0) - 1}
                        className="p-1.5 bg-white border border-gray-100 text-gray-500 hover:text-blue-600 rounded-lg shadow-sm disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => {
                          const newBlocks = tData.contentBlocks?.filter(b => b.id !== block.id);
                          setTData({...tData, contentBlocks: newBlocks});
                        }}
                        className="p-1.5 bg-white border border-gray-100 text-red-500 hover:bg-red-50 rounded-lg shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center">
                      {block.type === 'text' && <BookOpen className="w-3 h-3 mr-1" />}
                      {block.type === 'image' && <Image className="w-3 h-3 mr-1" />}
                      {block.type === 'video' && <Video className="w-3 h-3 mr-1" />}
                      Bloc {block.type === 'text' ? 'Texte' : block.type === 'image' ? 'Image' : 'Vidéo'}
                    </div>

                    {block.type === 'text' ? (
                      <textarea 
                        rows={10}
                        className="w-full px-4 py-3 bg-white border-gray-200 rounded-xl border focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none font-medium text-sm leading-relaxed"
                        value={block.value}
                        onChange={e => {
                          const newBlocks = [...(tData.contentBlocks || [])];
                          newBlocks[idx] = { ...block, value: e.target.value };
                          setTData({...tData, contentBlocks: newBlocks});
                        }}
                        placeholder="Saisissez votre texte ici..."
                      />
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <input 
                            className="flex-1 px-4 py-3 bg-white border-gray-200 rounded-xl border focus:border-blue-600 outline-none font-medium text-sm"
                            value={block.value}
                            onChange={e => {
                              const newBlocks = [...(tData.contentBlocks || [])];
                              newBlocks[idx] = { ...block, value: e.target.value };
                              setTData({...tData, contentBlocks: newBlocks});
                            }}
                            placeholder={block.type === 'image' ? "URL de l'image ou bien uploader un fichier..." : "URL de la vidéo ou bien uploader un fichier..."}
                          />
                          <div className="relative">
                            <input
                              type="file"
                              accept={block.type === 'image' ? "image/*" : "video/*"}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file, block.id, idx);
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <button className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm whitespace-nowrap transition-colors flex items-center">
                              {uploadProgress[block.id] !== undefined ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <FileDown className="w-4 h-4 mr-2" />
                              )}
                              Upload
                            </button>
                          </div>
                        </div>
                        {uploadProgress[block.id] !== undefined && (
                          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${uploadProgress[block.id]}%` }}></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-4">
                <button 
                  onClick={() => setTData({
                    ...tData, 
                    contentBlocks: [...(tData.contentBlocks || []), { id: Date.now().toString(), type: 'text', value: '' }]
                  })}
                  className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 flex items-center transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Texte
                </button>
                <button 
                  onClick={() => setTData({
                    ...tData, 
                    contentBlocks: [...(tData.contentBlocks || []), { id: Date.now().toString(), type: 'image', value: '' }]
                  })}
                  className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 flex items-center transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Image
                </button>
                <button 
                  onClick={() => setTData({
                    ...tData, 
                    contentBlocks: [...(tData.contentBlocks || []), { id: Date.now().toString(), type: 'video', value: '' }]
                  })}
                  className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 flex items-center transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Vidéo
                </button>
              </div>
            </div>
            <button 
              onClick={saveTraining}
              disabled={saving}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center space-x-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              <span>Sauvegarder les changements</span>
            </button>
          </div>
        )}

        {activeTab === 'quiz' && (
          <div className="space-y-6 pb-10">
            <div className="flex items-center justify-between mb-8 sticky top-0 bg-white py-4 z-10">
               <h3 className="text-xl font-bold text-gray-900 tracking-tight">Questions ({questions.length})</h3>
               <button 
                onClick={addQuestion}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center space-x-2 hover:bg-blue-700 transition-all shadow-lg active:scale-95"
               >
                 <Plus className="w-4 h-4" />
                 <span>Ajouter Question</span>
               </button>
            </div>
            
            <div className="space-y-8">
              {questions.map((q, qIdx) => (
                <QuestionEditor 
                  key={q.id}
                  q={q}
                  qIdx={qIdx}
                  total={questions.length}
                  moveQuestion={moveQuestion}
                  deleteQuestion={deleteQuestion}
                  onSave={updateQuestion}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex flex-col items-center">
                 <Users className="w-6 h-6 text-blue-600 mb-2" />
                 <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Certificats Déliérés</span>
                 <span className="text-3xl font-black text-gray-900 mt-1">{results.length}</span>
              </div>
              <div className="bg-green-50/50 p-6 rounded-3xl border border-green-100 flex flex-col items-center">
                 <CheckCircle2 className="w-6 h-6 text-green-600 mb-2" />
                 <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Taux de Validation</span>
                 <span className="text-3xl font-black text-gray-900 mt-1">100%</span>
              </div>
            </div>

            <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-4">Dernières Certifications</h3>
            {results.length > 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Étudiant</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Institution</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Délivré le</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {results.map((res) => (
                        <tr key={res.id} className="hover:bg-blue-50/20 transition-colors group">
                          <td className="px-6 py-4 font-bold text-gray-900">{res.firstName} {res.lastName}</td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-500 font-mono uppercase italic">{res.institution}</td>
                          <td className="px-6 py-4 text-xs text-gray-400">{res.date}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => deleteResult(res.id)}
                              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Supprimer la certification"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 border-2 border-dashed border-gray-100 rounded-3xl">
                <Users className="w-12 h-12 text-gray-100 mx-auto mb-4" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Aucun certificat n'a encore été émis</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
