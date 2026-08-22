"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Save, List, CircleCheck as CheckCircle, Trash2, CirclePlus as PlusCircle, LayoutDashboard, Calculator, Wallet, History, X, ChartPie as PieChart, TrendingUp, TrendingDown, ChevronLeft, Pencil, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
function numberToFrench(num: number): string {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix'];

  if (num === 0) return 'zéro';

  const isNegative = num < 0;
  num = Math.abs(num);

  function convertLessThanThousand(n: number): string {
    if (n === 0) return '';
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const unit = n % 10;
      if (ten === 7 || ten === 9) {
        return tens[ten - 1] + '-' + teens[unit];
      }
      return tens[ten] + (unit ? '-' + units[unit] : '');
    }

    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let result = hundred > 1 ? units[hundred] + ' cent' : 'cent';
    if (rest) result += ' ' + convertLessThanThousand(rest);
    return result;
  }

  const integerPart = Math.floor(num);
  let result = '';

  if (integerPart >= 1000) {
    const thousand = Math.floor(integerPart / 1000);
    result = (thousand === 1 ? 'mille' : convertLessThanThousand(thousand) + ' mille');
    const rest = integerPart % 1000;
    if (rest) result += ' ' + convertLessThanThousand(rest);
  } else {
    result = convertLessThanThousand(integerPart);
  }

  const decimalPart = Math.round((num - integerPart) * 1000);
  if (decimalPart > 0) {
    result += ' dinars et ' + convertLessThanThousand(decimalPart) + ' millimes';
  } else {
    result += ' dinars';
  }

  if (isNegative) {
    result = 'moins ' + result.trim();
  }

  return result.charAt(0).toUpperCase() + result.slice(1);
}

type Branche = 'Automobile' | 'MRH' | 'MRP' | 'MRE' | 'MRA' | 'Santé' | 'Vie' | 'Incendie' | 'Ristourne';

interface MemoireLine {
  id: string;
  branche: Branche;
  numeroContrat: string;
  detailsContrat: string;
  client: string;
  primeTTC: number;
  echeance: string;
  immatriculation?: string;
}

interface MemoireDB {
  id: string;
  client: string;
  date_memoire: string;
  total_prime: number;
  statut: string;
  date_paiement: string | null;
  details?: MemoireLine[];
  pdf_url?: string;
  titre?: string;
}

interface Paiement {
  id: string;
  memoire_id: string;
  montant: number;
  date_paiement: string;
  note?: string | null;
  created_at?: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'create' | 'view' | 'stats'>('create');
  const [memoireTitre, setMemoireTitre] = useState('');

  // Form State
  const [branche, setBranche] = useState<Branche>('Automobile');
  const [numeroContrat, setNumeroContrat] = useState('');
  const [detailsContrat, setDetailsContrat] = useState('');
  const [client, setClient] = useState('');
  const [primeTTC, setPrimeTTC] = useState('');
  const [echeance, setEcheance] = useState('');
  const [immatriculation, setImmatriculation] = useState('');

  // Current Lines State
  const [lines, setLines] = useState<MemoireLine[]>([]);

  // DB Memoires State
  const [memoires, setMemoires] = useState<MemoireDB[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // Partial Payment Modal State
  const [partialModal, setPartialModal] = useState<{ memoireId: string; client: string; total: number; paid: number } | null>(null);
  const [partialMontant, setPartialMontant] = useState('');
  const [partialDate, setPartialDate] = useState(new Date().toISOString().split('T')[0]);
  const [partialNote, setPartialNote] = useState('');
  const [savingPartial, setSavingPartial] = useState(false);

  // Payment History Modal State
  const [historyModal, setHistoryModal] = useState<{ memoireId: string; client: string } | null>(null);
  const [historyPaiements, setHistoryPaiements] = useState<Paiement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null);

  // Per-mémoire paid amounts (memoireId -> total paid)
  const [paidMap, setPaidMap] = useState<Record<string, number>>({});

  // Stats drill-down state
  const [statsDrilldown, setStatsDrilldown] = useState<'none' | 'paye' | 'nonpaye'>('none');

  // Auth state
  const [session, setSession] = useState<any>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Edit modal state
  const [editModal, setEditModal] = useState<MemoireDB | null>(null);
  const [editClient, setEditClient] = useState('');
  const [editTitre, setEditTitre] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTotal, setEditTotal] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const isHamza = session?.user?.email === 'hamza@shiri.tn';

  const branches: Branche[] = ['Automobile', 'MRH', 'MRP', 'MRE', 'MRA', 'Santé', 'Vie', 'Incendie', 'Ristourne'];

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !primeTTC || !echeance || !numeroContrat) {
      showToast('Veuillez remplir les champs obligatoires', 'error');
      return;
    }

    if (branche === 'Automobile' && !immatriculation) {
      showToast('L\'immatriculation est obligatoire pour l\'Automobile', 'error');
      return;
    }

    let finalPrime = parseFloat(primeTTC);
    if (branche === 'Ristourne') {
      finalPrime = -Math.abs(finalPrime);
    } else {
      finalPrime = Math.abs(finalPrime);
    }

    const newLine: MemoireLine = {
      id: crypto.randomUUID(),
      branche,
      numeroContrat,
      detailsContrat,
      client,
      primeTTC: finalPrime,
      echeance,
      immatriculation: branche === 'Automobile' ? immatriculation : undefined
    };

    setLines([...lines, newLine]);

    // Reset fields except maybe client to go faster, but prompt says "Les champs du formulaire sont réinitialisés"
    setBranche('Automobile');
    setNumeroContrat('');
    setDetailsContrat('');
    setClient('');
    setPrimeTTC('');
    setEcheance('');
    setImmatriculation('');
  };

  const removeLine = (id: string) => {
    setLines(lines.filter(l => l.id !== id));
  };

  const totalPrimes = lines.reduce((acc, curr) => acc + curr.primeTTC, 0);

  const generatePDF = async () => {
    if (lines.length === 0) return;
    setLoading(true);

    try {
      const doc = new jsPDF('landscape');

      // Load Logo
      let logoData: HTMLImageElement | null = null;
      try {
        logoData = new Image();
        logoData.src = '/logo.png';
        await new Promise((resolve) => {
          if (!logoData) return resolve(false);
          logoData.onload = resolve;
          logoData.onerror = resolve; // Continue even if logo fails
        });

        if (logoData.complete && logoData.naturalHeight !== 0) {
          doc.addImage(logoData, 'PNG', 15, 10, 40, 25);
        }
      } catch (e) {
        console.log("Logo could not be loaded");
      }

      // Header right
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 106, 84); // Secondary color
      doc.text('Agence SHIRI FARES HAMZA', 280, 15, { align: 'right' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('LE LEADER DES ASSUREURS', 280, 21, { align: 'right' });
      doc.text('TEL 72486210', 280, 27, { align: 'right' });
      doc.text('MATEUR', 280, 33, { align: 'right' });

      // Title
      doc.setFontSize(18);
      doc.setTextColor(37, 106, 84);
      doc.setFont('helvetica', 'bold');
      const finalTitle = memoireTitre.trim() !== '' ? memoireTitre.toUpperCase() : 'MÉMOIRE DE RÈGLEMENT';
      doc.text(finalTitle, 148, 50, { align: 'center' });

      // Date and Client Main
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Date : ${format(new Date(), 'dd/MM/yyyy')}`, 15, 60);
      doc.text(`Client Principal : ${lines[0].client}`, 15, 68);

      // Table
      const tableColumn = ["Branche", "N° Contrat", "Client", "Détails", "Échéance", "Immatriculation", "Prime TTC (DT)"];
      const tableRows = lines.map(line => [
        line.branche,
        line.numeroContrat,
        line.client,
        line.detailsContrat || '-',
        format(new Date(line.echeance), 'dd/MM/yyyy'),
        line.immatriculation || '-',
        line.primeTTC.toFixed(3)
      ]);

      autoTable(doc, {
        startY: 75,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [37, 106, 84], textColor: 255 }, // Secondary color
        styles: { fontSize: 11, cellPadding: 4 },
        columnStyles: { 6: { halign: 'right' } }
      });

      // Totals
      const finalY = (doc as any).lastAutoTable.finalY + 15;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      const totalStr = `${totalPrimes.toFixed(3)} DT`;
      doc.text(`Total des primes : ${totalStr}`, 280, finalY, { align: 'right' });

      // Numbers to words in french
      let words = numberToFrench(totalPrimes);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'italic');
      doc.text(`Arrêté la présente mémoire à la somme de :`, 15, finalY);
      doc.text(words, 15, finalY + 7);

      const fileName = `Memoire_${lines[0].client.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;

      doc.save(fileName);

      // Convert PDF to ArrayBuffer for Supabase Storage
      const pdfBuffer = doc.output('arraybuffer');

      // Upload to Supabase
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('memoires_pdf')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: false // Don't overwrite just in case, name has timestamp
        });

      if (uploadError) {
        console.error('Storage error:', uploadError);
        throw new Error(`Erreur Supabase Storage : ${uploadError.message || 'Impossible d\'enregistrer le fichier'}`);
      }

      // Get the public URL for the newly uploaded PDF
      const { data: publicUrlData } = supabase.storage.from('memoires_pdf').getPublicUrl(fileName);
      const pdfUrl = publicUrlData.publicUrl;

      // 2. Save to Supabase (Database table)
      const memoireToSave = {
        client: lines[0].client,
        titre: finalTitle,
        date_memoire: new Date().toISOString().split('T')[0],
        total_prime: totalPrimes,
        statut: 'Non payée',
        date_paiement: null,
        pdf_url: pdfUrl
      };

      const { error } = await supabase.from('memoires').insert([memoireToSave]);

      if (error) {
        console.error('Supabase save error:', error);
        // We do not fail the flow if table doesn't exist yet, we just show error.
        throw error;
      }

      showToast('Mémoire générée et enregistrée avec succès', 'success');
      setLines([]); // Vider le tableau
      setMemoireTitre(''); // Vider le titre

    } catch (error: any) {
      showToast('Erreur lors de l\'enregistrement : ' + error?.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMemoires = async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase
        .from('memoires')
        .select('*')
        .order('date_memoire', { ascending: false });

      if (error) throw error;
      setMemoires(data || []);

      // Fetch all paiements to compute paid amounts per memoire
      const { data: allPaiements, error: pErr } = await supabase
        .from('paiements')
        .select('memoire_id, montant');

      if (!pErr && allPaiements) {
        const map: Record<string, number> = {};
        for (const p of allPaiements) {
          map[p.memoire_id] = (map[p.memoire_id] || 0) + Number(p.montant);
        }
        setPaidMap(map);
      } else {
        setPaidMap({});
      }
    } catch (error: any) {
      showToast('Erreur chargement: ' + error?.message, 'error');
    } finally {
      setFetching(false);
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('memoires')
        .update({ statut: 'Payée', date_paiement: today })
        .eq('id', id);

      if (error) throw error;

      showToast('Mémoire marquée comme payée', 'success');
      setMemoires(memoires.map(m => m.id === id ? { ...m, statut: 'Payée', date_paiement: today } : m));
    } catch (error: any) {
      showToast('Erreur mise à jour: ' + error?.message, 'error');
    }
  };

  const openPartialModal = (m: MemoireDB) => {
    const paid = paidMap[m.id] || 0;
    setPartialModal({ memoireId: m.id, client: m.client, total: Number(m.total_prime), paid });
    setPartialMontant('');
    setPartialDate(new Date().toISOString().split('T')[0]);
    setPartialNote('');
  };

  const closePartialModal = () => {
    setPartialModal(null);
    setPartialMontant('');
    setPartialNote('');
  };

  const savePartialPayment = async () => {
    if (!partialModal) return;
    const montant = parseFloat(partialMontant);
    if (isNaN(montant) || montant <= 0) {
      showToast('Veuillez saisir un montant valide', 'error');
      return;
    }
    if (!partialDate) {
      showToast('Veuillez saisir une date de paiement', 'error');
      return;
    }

    const remaining = partialModal.total - partialModal.paid;
    if (montant > remaining + 0.001) {
      showToast(`Le montant dépasse le solde restant (${remaining.toFixed(3)} DT)`, 'error');
      return;
    }

    setSavingPartial(true);
    try {
      const { error } = await supabase.from('paiements').insert([{
        memoire_id: partialModal.memoireId,
        montant,
        date_paiement: partialDate,
        note: partialNote.trim() || null
      }]);

      if (error) throw error;

      const newPaid = partialModal.paid + montant;
      const isFullyPaid = newPaid >= partialModal.total - 0.001;

      // Update memoire status if fully paid
      if (isFullyPaid) {
        await supabase
          .from('memoires')
          .update({ statut: 'Payée', date_paiement: partialDate })
          .eq('id', partialModal.memoireId);
        setMemoires(prev => prev.map(m => m.id === partialModal.memoireId ? { ...m, statut: 'Payée', date_paiement: partialDate } : m));
      } else {
        setMemoires(prev => prev.map(m => m.id === partialModal.memoireId ? { ...m, statut: 'Partiellement payée', date_paiement: null } : m));
        await supabase
          .from('memoires')
          .update({ statut: 'Partiellement payée', date_paiement: null })
          .eq('id', partialModal.memoireId);
      }

      setPaidMap(prev => ({ ...prev, [partialModal.memoireId]: newPaid }));
      showToast(isFullyPaid ? 'Mémoire entièrement liquidée' : 'Paiement partiel enregistré', 'success');
      closePartialModal();
    } catch (error: any) {
      showToast('Erreur enregistrement paiement : ' + error?.message, 'error');
    } finally {
      setSavingPartial(false);
    }
  };

  const openHistoryModal = async (m: MemoireDB) => {
    setHistoryModal({ memoireId: m.id, client: m.client });
    setHistoryPaiements([]);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('paiements')
        .select('*')
        .eq('memoire_id', m.id)
        .order('date_paiement', { ascending: false });

      if (error) throw error;
      setHistoryPaiements((data || []) as Paiement[]);
    } catch (error: any) {
      showToast('Erreur chargement historique : ' + error?.message, 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistoryModal = () => {
    setHistoryModal(null);
    setHistoryPaiements([]);
    setHistoryDeletingId(null);
  };

  const deletePaiement = async (paiementId: string, memoireId: string) => {
    setHistoryDeletingId(paiementId);
    try {
      const { error } = await supabase.from('paiements').delete().eq('id', paiementId);
      if (error) throw error;

      // Refresh history list
      setHistoryPaiements(prev => prev.filter(p => p.id !== paiementId));

      // Recompute paid amount for this memoire
      const removed = historyPaiements.find(p => p.id === paiementId);
      if (removed) {
        const newPaid = (paidMap[memoireId] || 0) - Number(removed.montant);
        setPaidMap(prev => ({ ...prev, [memoireId]: Math.max(0, newPaid) }));

        // Update memoire status
        const memoire = memoires.find(m => m.id === memoireId);
        if (memoire) {
          if (newPaid <= 0.001) {
            await supabase.from('memoires').update({ statut: 'Non payée', date_paiement: null }).eq('id', memoireId);
            setMemoires(prev => prev.map(m => m.id === memoireId ? { ...m, statut: 'Non payée', date_paiement: null } : m));
          } else {
            await supabase.from('memoires').update({ statut: 'Partiellement payée', date_paiement: null }).eq('id', memoireId);
            setMemoires(prev => prev.map(m => m.id === memoireId ? { ...m, statut: 'Partiellement payée', date_paiement: null } : m));
          }
        }
      }
      showToast('Paiement supprimé', 'success');
    } catch (error: any) {
      showToast('Erreur suppression : ' + error?.message, 'error');
    } finally {
      setHistoryDeletingId(null);
    }
  };

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) throw error;
      setLoginModalOpen(false);
      setLoginEmail('');
      setLoginPassword('');
      showToast('Connexion réussie', 'success');
    } catch (error: any) {
      setLoginError(error?.message || 'Erreur de connexion');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    showToast('Déconnecté', 'success');
  };

  const openEditModal = (m: MemoireDB) => {
    setEditModal(m);
    setEditClient(m.client);
    setEditTitre(m.titre || '');
    setEditDate(m.date_memoire);
    setEditTotal(Number(m.total_prime).toString());
  };

  const closeEditModal = () => {
    setEditModal(null);
  };

  const saveEditMemoire = async () => {
    if (!editModal) return;
    if (!editClient.trim() || !editDate || !editTotal) {
      showToast('Veuillez remplir les champs obligatoires', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('memoires')
        .update({
          client: editClient.trim(),
          titre: editTitre.trim() || 'MÉMOIRE DE RÈGLEMENT',
          date_memoire: editDate,
          total_prime: parseFloat(editTotal),
        })
        .eq('id', editModal.id);

      if (error) throw error;

      setMemoires(prev => prev.map(m => m.id === editModal.id ? {
        ...m,
        client: editClient.trim(),
        titre: editTitre.trim() || 'MÉMOIRE DE RÈGLEMENT',
        date_memoire: editDate,
        total_prime: parseFloat(editTotal),
      } : m));
      showToast('Mémoire modifiée avec succès', 'success');
      closeEditModal();
    } catch (error: any) {
      showToast('Erreur modification : ' + error?.message, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    }).catch(() => {
      // ignore session errors — app works without login
    });
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });
      subscription = data.subscription;
    } catch {
      // ignore
    }
    return () => {
      try { subscription?.unsubscribe(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'view' || activeTab === 'stats') {
      fetchMemoires();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col items-center">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-md shadow-lg text-white animate-fade-in flex items-center gap-2 ${toast.type === 'success' ? 'bg-primary' : 'bg-destructive'}`}>
          {toast.type === 'success' ? <CheckCircle size={20} /> : <div className="font-bold">!</div>}
          {toast.message}
        </div>
      )}

      {/* Header App */}
      <header className="w-full bg-white border-b border-border py-4 px-6 md:px-12 flex items-center justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="STAR Assurances" className="h-12 object-contain hidden sm:block" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <h1 className="text-2xl font-bold text-secondary flex items-center gap-2">
            <Calculator className="text-primary h-7 w-7" />
            Mémoires de Règlement
          </h1>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 ${activeTab === 'create' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
          >
            <PlusCircle size={18} />
            <span className="hidden sm:inline">Créer</span>
          </button>
          <button
            onClick={() => setActiveTab('view')}
            className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 ${activeTab === 'view' ? 'bg-secondary text-secondary-foreground' : 'text-foreground hover:bg-muted'}`}
          >
            <List size={18} />
            <span className="hidden sm:inline">Liste</span>
          </button>
          <button
            onClick={() => { setActiveTab('stats'); setStatsDrilldown('none'); }}
            className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 ${activeTab === 'stats' ? 'bg-secondary text-secondary-foreground' : 'text-foreground hover:bg-muted'}`}
          >
            <PieChart size={18} />
            <span className="hidden sm:inline">Statistiques</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isHamza ? (
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 text-foreground hover:bg-muted cursor-pointer"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Déconnecter</span>
            </button>
          ) : (
            <button
              onClick={() => { setLoginModalOpen(true); setLoginError(''); }}
              className="px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 bg-secondary text-primary-foreground hover:opacity-90 cursor-pointer"
            >
              <LogIn size={18} />
              <span className="hidden sm:inline">Connexion</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl p-4 md:p-8">

        {activeTab === 'create' && (
          <div className="space-y-8 animate-fade-in">
            {/* Form Section */}
            <div className="glass-panel p-6 rounded-lg">
              <h2 className="text-xl font-bold text-secondary mb-6 flex items-center gap-2">
                <FileText className="text-primary" size={24} />
                Nouvelle Ligne de Mémoire
              </h2>

              <form onSubmit={handleAddLine} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-end">
                <div>
                  <label className="block text-sm font-medium mb-1">Branche <span className="text-destructive">*</span></label>
                  <select
                    className="input-field cursor-pointer"
                    value={branche}
                    onChange={(e) => {
                      const val = e.target.value as Branche;
                      setBranche(val);
                      if (val === 'Ristourne' && primeTTC && parseFloat(primeTTC) > 0) {
                        setPrimeTTC('-' + primeTTC);
                      } else if (val !== 'Ristourne' && primeTTC && parseFloat(primeTTC) < 0) {
                        setPrimeTTC(Math.abs(parseFloat(primeTTC)).toString());
                      }
                    }}
                    required
                  >
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">N° Contrat <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    className="input-field uppercase"
                    placeholder="Numéro du contrat"
                    value={numeroContrat}
                    onChange={(e) => setNumeroContrat(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Client <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Nom du client"
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Détails <span className="text-muted-foreground">(Optionnel)</span></label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Détails du contrat"
                    value={detailsContrat}
                    onChange={(e) => setDetailsContrat(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Prime TTC (DT) <span className="text-destructive">*</span></label>
                  <input
                    type="number"
                    step="0.001"
                    min={branche !== 'Ristourne' ? "0" : undefined}
                    max={branche === 'Ristourne' ? "0" : undefined}
                    className="input-field"
                    placeholder="0.000"
                    value={primeTTC}
                    onChange={(e) => setPrimeTTC(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Échéance <span className="text-destructive">*</span></label>
                  <input
                    type="date"
                    className="input-field cursor-pointer"
                    value={echeance}
                    onChange={(e) => setEcheance(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${branche !== 'Automobile' ? 'text-muted-foreground' : ''}`}>Immatriculation {branche === 'Automobile' && <span className="text-destructive">*</span>}</label>
                  <input
                    type="text"
                    className="input-field disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed uppercase"
                    placeholder="Ex: 123 TUN 4567"
                    value={immatriculation}
                    onChange={(e) => setImmatriculation(e.target.value)}
                    disabled={branche !== 'Automobile'}
                    required={branche === 'Automobile'}
                  />
                </div>

                <div>
                  <button type="submit" className="btn-primary w-full h-[42px]">
                    <Save size={18} />
                    Sauvegarder
                  </button>
                </div>
              </form>
            </div>

            {/* Table Section */}
            <div className="glass-panel rounded-lg overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-border flex justify-between items-center">
                <h3 className="font-bold text-secondary text-lg">Lignes à inclure</h3>
                <span className="bg-primary/20 text-secondary-hover px-3 py-1 rounded-full text-sm font-bold">
                  Total : {totalPrimes.toFixed(3)} DT
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="table-header text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3 rounded-tl-lg">Branche</th>
                      <th className="px-6 py-3">N° Contrat</th>
                      <th className="px-6 py-3">Client</th>
                      <th className="px-6 py-3">Détails</th>
                      <th className="px-6 py-3">Prime TTC</th>
                      <th className="px-6 py-3">Échéance</th>
                      <th className="px-6 py-3">Immatriculation</th>
                      <th className="px-6 py-3 rounded-tr-lg text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground italic">
                          Aucune ligne saisie. Remplissez le formulaire ci-dessus pour commencer.
                        </td>
                      </tr>
                    ) : (
                      lines.map((line) => (
                        <tr key={line.id} className="bg-white border-b hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium">{line.branche}</td>
                          <td className="px-6 py-4">{line.numeroContrat}</td>
                          <td className="px-6 py-4">{line.client}</td>
                          <td className="px-6 py-4">{line.detailsContrat || '-'}</td>
                          <td className="px-6 py-4 font-bold text-secondary">{line.primeTTC.toFixed(3)} DT</td>
                          <td className="px-6 py-4">{format(new Date(line.echeance), 'dd/MM/yyyy')}</td>
                          <td className="px-6 py-4">{line.immatriculation || '-'}</td>
                          <td className="px-6 py-4 flex justify-center">
                            <button
                              onClick={() => removeLine(line.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-colors focus:ring-2 focus:ring-red-200 focus:outline-none cursor-pointer"
                              title="Supprimer la ligne"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {lines.length > 0 && (
                <div className="p-4 bg-white border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="w-full sm:w-1/2">
                    <label className="block text-sm font-medium mb-1">Titre de la Mémoire <span className="text-muted-foreground">(Optionnel)</span></label>
                    <input
                      type="text"
                      className="input-field font-semibold"
                      placeholder="Ex: MÉMOIRE DE RÈGLEMENT (Par défaut)"
                      value={memoireTitre}
                      onChange={(e) => setMemoireTitre(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={generatePDF}
                    disabled={loading}
                    className="btn-secondary py-3 px-6 text-base whitespace-nowrap"
                  >
                    <FileText size={20} />
                    {loading ? 'Génération en cours...' : 'Générer la Mémoire'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* View Memoires Tab */}
        {activeTab === 'view' && (
          <div className="space-y-6 animate-fade-in relative">
            <h2 className="text-xl font-bold text-secondary mb-4 flex items-center gap-2">
              <LayoutDashboard className="text-primary" size={24} />
              Historique des Mémoires
            </h2>

            <div className="glass-panel rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="table-header text-xs uppercase bg-secondary text-primary-foreground">
                    <tr>
                      <th className="px-6 py-3 rounded-tl-lg">Titre</th>
                      <th className="px-6 py-3">Client Principal</th>
                      <th className="px-6 py-3">Date de Mémoire</th>
                      <th className="px-6 py-3">Total (DT)</th>
                      <th className="px-6 py-3">Versé (DT)</th>
                      <th className="px-6 py-3">Solde (DT)</th>
                      <th className="px-6 py-3">Statut</th>
                      <th className="px-6 py-3 rounded-tr-lg text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fetching ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-8 text-center text-muted-foreground">
                          Chargement des données...
                        </td>
                      </tr>
                    ) : memoires.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-8 text-center text-muted-foreground italic">
                          Aucune mémoire enregistrée.
                        </td>
                      </tr>
                    ) : (
                      memoires.map((m) => {
                        const paid = paidMap[m.id] || 0;
                        const solde = Number(m.total_prime) - paid;
                        return (
                          <tr key={m.id} className="bg-white border-b hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-gray-700">{m.titre || 'MÉMOIRE DE RÈGLEMENT'}</td>
                            <td className="px-6 py-4 font-medium">{m.client}</td>
                            <td className="px-6 py-4">
                              {format(new Date(m.date_memoire), 'dd/MM/yyyy')}
                            </td>
                            <td className="px-6 py-4 font-bold text-secondary">
                              {Number(m.total_prime).toFixed(3)}
                            </td>
                            <td className="px-6 py-4 font-medium text-green-700">
                              {paid.toFixed(3)}
                            </td>
                            <td className="px-6 py-4 font-bold text-red-600">
                              {solde.toFixed(3)}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${m.statut === 'Payée' ? 'bg-green-100 text-green-800' : m.statut === 'Partiellement payée' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                {m.statut}
                              </span>
                            </td>
                            <td className="px-6 py-4 flex justify-center gap-2 flex-wrap">
                              {m.pdf_url && (
                                <a
                                  href={m.pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                  title="Voir le PDF"
                                >
                                  <FileText size={16} />
                                  PDF
                                </a>
                              )}
                              {m.statut !== 'Payée' && (
                                <button
                                  onClick={() => openPartialModal(m)}
                                  className="bg-[#A1C936] text-white hover:bg-[#8cb52b] px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                  title="Liquider partiellement"
                                >
                                  <Wallet size={16} />
                                  Liquider
                                </button>
                              )}
                              <button
                                onClick={() => openHistoryModal(m)}
                                className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                title="Historique des paiements"
                              >
                                <History size={16} />
                                Détails
                              </button>
                              {isHamza && (
                                <button
                                  onClick={() => openEditModal(m)}
                                  className="bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                  title="Modifier la mémoire"
                                >
                                  <Pencil size={16} />
                                  Modifier
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (() => {
          const total = memoires.length;
          const payees = memoires.filter(m => m.statut === 'Payée').length;
          const partielles = memoires.filter(m => m.statut === 'Partiellement payée').length;
          const nonPayees = memoires.filter(m => m.statut !== 'Payée' && m.statut !== 'Partiellement payée').length;
          const totalPayees = payees + partielles;

          const totalMontant = memoires.reduce((acc, m) => acc + Number(m.total_prime), 0);
          const totalVerse = memoires.reduce((acc, m) => acc + (paidMap[m.id] || 0), 0);
          const totalSolde = totalMontant - totalVerse;
          const nonPayeeList = memoires.filter(m => m.statut !== 'Payée' && m.statut !== 'Partiellement payée');
          const nonPayeeMontant = nonPayeeList.reduce((acc, m) => acc + Number(m.total_prime), 0);

          const Donut = ({ segments, size = 220, strokeWidth = 30, centerValue, centerLabel, centerColor, onSegmentClick }: {
            segments: { value: number; color: string; label: string; clickable?: boolean; onClick?: () => void }[];
            size?: number; strokeWidth?: number; centerValue: string; centerLabel: string; centerColor: string;
            onSegmentClick?: (index: number) => void;
          }) => {
            const radius = (size - strokeWidth) / 2;
            const circumference = 2 * Math.PI * radius;
            const totalSeg = segments.reduce((a, s) => a + s.value, 0) || 1;
            let offset = 0;
            return (
              <div className="flex flex-col items-center">
                <div className="relative group" style={{ width: size, height: size }}>
                  <svg width={size} height={size} className="-rotate-90 drop-shadow-sm">
                    <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
                    {segments.map((seg, i) => {
                      const len = (seg.value / totalSeg) * circumference;
                      const el = (
                        <circle
                          key={i}
                          cx={size/2} cy={size/2} r={radius} fill="none"
                          stroke={seg.color} strokeWidth={strokeWidth}
                          strokeDasharray={`${len} ${circumference - len}`}
                          strokeDashoffset={-offset}
                          strokeLinecap="round"
                          className={seg.clickable ? 'cursor-pointer transition-all duration-300 hover:opacity-80' : ''}
                          style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease, opacity 0.2s ease' }}
                          onClick={() => seg.clickable && seg.onClick?.()}
                        />
                      );
                      offset += len;
                      return el;
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-4xl font-extrabold tracking-tight" style={{ color: centerColor }}>{centerValue}</span>
                    <span className="text-xs text-muted-foreground mt-1 font-medium">{centerLabel}</span>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-4 mt-5">
                  {segments.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => s.clickable && s.onClick?.()}
                      className={`flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 transition-all ${s.clickable ? 'cursor-pointer hover:bg-muted' : 'cursor-default'}`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ background: s.color }} />
                      <span className="text-muted-foreground font-medium">{s.label}</span>
                      <span className="font-bold text-foreground">{s.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          };

          const StatCard = ({ icon: Icon, label, value, unit, color, bg, border }: {
            icon: any; label: string; value: string; unit: string; color: string; bg: string; border: string;
          }) => (
            <div className={`${bg} ${border} border rounded-2xl p-5 flex flex-col gap-1.5 transition-transform hover:scale-[1.03] hover:shadow-md`}>
              <div className="flex items-center gap-2" style={{ color }}>
                <Icon size={18} />
                <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
              </div>
              <span className="text-2xl font-bold" style={{ color }}>{value}</span>
              <span className="text-xs text-muted-foreground">{unit}</span>
            </div>
          );

          return (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-bold text-secondary mb-4 flex items-center gap-2">
                <PieChart className="text-primary" size={24} />
                Statistiques des Mémoires
              </h2>

              {fetching ? (
                <div className="glass-panel p-12 text-center text-muted-foreground">Chargement des statistiques...</div>
              ) : total === 0 ? (
                <div className="glass-panel p-12 text-center text-muted-foreground italic">Aucune mémoire enregistrée pour calculer les statistiques.</div>
              ) : statsDrilldown === 'none' ? (
                <>
                  {/* Main Donut: Payé vs Non Payé */}
                  <div className="glass-panel p-8 rounded-2xl flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16">
                    <div className="flex flex-col items-center">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-6">Répartition par Statut</h3>
                      <Donut
                        segments={[
                          { value: totalPayees, color: '#16a34a', label: 'Payées', clickable: true, onClick: () => setStatsDrilldown('paye') },
                          { value: nonPayees, color: '#dc2626', label: 'Non payées', clickable: true, onClick: () => setStatsDrilldown('nonpaye') },
                        ]}
                        centerValue={`${total}`}
                        centerLabel="Mémoires"
                        centerColor="#256a54"
                      />
                      <p className="text-xs text-muted-foreground mt-5 text-center">
                        Cliquez sur une portion du cercle pour les détails
                      </p>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-4 w-full lg:w-[420px]">
                      <StatCard icon={TrendingUp} label="Total Versé" value={totalVerse.toFixed(3)} unit="DT" color="#16a34a" bg="bg-green-50" border="border-green-200" />
                      <StatCard icon={TrendingDown} label="Solde Restant" value={totalSolde.toFixed(3)} unit="DT" color="#dc2626" bg="bg-red-50" border="border-red-200" />
                      <StatCard icon={FileText} label="Total Mémoires" value={totalMontant.toFixed(3)} unit="DT" color="#2563eb" bg="bg-blue-50" border="border-blue-200" />
                      <StatCard icon={Calculator} label="Nombre Total" value={`${total}`} unit="mémoires" color="#d97706" bg="bg-amber-50" border="border-amber-200" />
                    </div>
                  </div>
                </>
              ) : statsDrilldown === 'paye' ? (
                /* Drill-down: payé details */
                <div className="space-y-6 animate-fade-in">
                  <button
                    onClick={() => setStatsDrilldown('none')}
                    className="flex items-center gap-1 text-sm font-medium text-secondary hover:text-primary transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={18} />
                    Retour
                  </button>

                  <div className="glass-panel p-8 rounded-2xl flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16">
                    <div className="flex flex-col items-center">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-6">Détail des Mémoires Payées</h3>
                      <Donut
                        segments={[
                          { value: payees, color: '#16a34a', label: 'Payées en total' },
                          { value: partielles, color: '#f59e0b', label: 'Payées partiellement' },
                        ]}
                        centerValue={`${totalPayees}`}
                        centerLabel="Payées"
                        centerColor="#16a34a"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-[420px]">
                      <StatCard icon={CheckCircle} label="Payées en Total" value={`${payees}`} unit="mémoires" color="#16a34a" bg="bg-green-50" border="border-green-200" />
                      <StatCard icon={Wallet} label="Partiellement Payées" value={`${partielles}`} unit="mémoires" color="#d97706" bg="bg-amber-50" border="border-amber-200" />
                      <StatCard icon={TrendingUp} label="Montant Versé" value={totalVerse.toFixed(3)} unit="DT" color="#16a34a" bg="bg-green-50" border="border-green-200" />
                      <StatCard icon={TrendingDown} label="Solde Restant" value={totalSolde.toFixed(3)} unit="DT" color="#dc2626" bg="bg-red-50" border="border-red-200" />
                    </div>
                  </div>

                  {/* Detailed table */}
                  <div className="glass-panel rounded-2xl overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-border">
                      <h3 className="font-bold text-secondary text-lg">Détail des Chiffres par Mémoire</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="table-header text-xs uppercase bg-secondary text-primary-foreground">
                          <tr>
                            <th className="px-6 py-3 rounded-tl-lg">Client</th>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Total (DT)</th>
                            <th className="px-6 py-3">Versé (DT)</th>
                            <th className="px-6 py-3">Solde (DT)</th>
                            <th className="px-6 py-3 rounded-tr-lg">Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {memoires.filter(m => m.statut === 'Payée' || m.statut === 'Partiellement payée').map((m) => {
                            const paid = paidMap[m.id] || 0;
                            const solde = Number(m.total_prime) - paid;
                            return (
                              <tr key={m.id} className="bg-white border-b hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4 font-medium">{m.client}</td>
                                <td className="px-6 py-4">{format(new Date(m.date_memoire), 'dd/MM/yyyy')}</td>
                                <td className="px-6 py-4 font-bold text-secondary">{Number(m.total_prime).toFixed(3)}</td>
                                <td className="px-6 py-4 font-medium text-green-700">{paid.toFixed(3)}</td>
                                <td className="px-6 py-4 font-bold text-red-600">{solde.toFixed(3)}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${m.statut === 'Payée' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {m.statut}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* Drill-down: non-payé details */
                <div className="space-y-6 animate-fade-in">
                  <button
                    onClick={() => setStatsDrilldown('none')}
                    className="flex items-center gap-1 text-sm font-medium text-secondary hover:text-primary transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={18} />
                    Retour
                  </button>

                  <div className="glass-panel p-8 rounded-2xl flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16">
                    <div className="flex flex-col items-center">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-6">Détail des Mémoires Non Payées</h3>
                      <Donut
                        segments={[
                          { value: nonPayees, color: '#dc2626', label: 'Non payées' },
                        ]}
                        centerValue={`${nonPayees}`}
                        centerLabel="Non payées"
                        centerColor="#dc2626"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-[420px]">
                      <StatCard icon={FileText} label="Mémoires Non Payées" value={`${nonPayees}`} unit="mémoires" color="#dc2626" bg="bg-red-50" border="border-red-200" />
                      <StatCard icon={TrendingDown} label="Montant Non Réglé" value={nonPayeeMontant.toFixed(3)} unit="DT" color="#dc2626" bg="bg-red-50" border="border-red-200" />
                      <StatCard icon={Calculator} label="Total Mémoires" value={`${total}`} unit="mémoires" color="#d97706" bg="bg-amber-50" border="border-amber-200" />
                      <StatCard icon={TrendingUp} label="Total Versé" value={totalVerse.toFixed(3)} unit="DT" color="#16a34a" bg="bg-green-50" border="border-green-200" />
                    </div>
                  </div>

                  {/* Detailed table */}
                  <div className="glass-panel rounded-2xl overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-border">
                      <h3 className="font-bold text-secondary text-lg">Détail des Mémoires Non Payées</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="table-header text-xs uppercase bg-secondary text-primary-foreground">
                          <tr>
                            <th className="px-6 py-3 rounded-tl-lg">Client</th>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Total (DT)</th>
                            <th className="px-6 py-3 rounded-tr-lg">Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nonPayeeList.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground italic">
                                Aucune mémoire non payée.
                              </td>
                            </tr>
                          ) : nonPayeeList.map((m) => (
                            <tr key={m.id} className="bg-white border-b hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 font-medium">{m.client}</td>
                              <td className="px-6 py-4">{format(new Date(m.date_memoire), 'dd/MM/yyyy')}</td>
                              <td className="px-6 py-4 font-bold text-secondary">{Number(m.total_prime).toFixed(3)}</td>
                              <td className="px-6 py-4">
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                                  {m.statut}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </main>

      {/* Partial Payment Modal */}
      {partialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={closePartialModal}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted cursor-pointer"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-secondary mb-1 flex items-center gap-2">
              <Wallet className="text-primary" size={20} />
              Liquidation partielle
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Client : <span className="font-medium text-foreground">{partialModal.client}</span>
            </p>

            <div className="bg-muted rounded-md p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total mémoire :</span>
                <span className="font-bold text-secondary">{partialModal.total.toFixed(3)} DT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Déjà versé :</span>
                <span className="font-bold text-green-700">{partialModal.paid.toFixed(3)} DT</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 mt-1">
                <span className="text-muted-foreground">Solde restant :</span>
                <span className="font-bold text-red-600">{(partialModal.total - partialModal.paid).toFixed(3)} DT</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Montant à liquider (DT) <span className="text-destructive">*</span></label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={(partialModal.total - partialModal.paid).toFixed(3)}
                  className="input-field"
                  placeholder="0.000"
                  value={partialMontant}
                  onChange={(e) => setPartialMontant(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date de paiement <span className="text-destructive">*</span></label>
                <input
                  type="date"
                  className="input-field cursor-pointer"
                  value={partialDate}
                  onChange={(e) => setPartialDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Note <span className="text-muted-foreground">(Optionnel)</span></label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: Chèque n°12345"
                  value={partialNote}
                  onChange={(e) => setPartialNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closePartialModal}
                className="flex-1 px-4 py-2 rounded-md font-medium border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={savePartialPayment}
                disabled={savingPartial}
                className="flex-1 btn-primary"
              >
                <Save size={18} />
                {savingPartial ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={closeHistoryModal}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted cursor-pointer"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-secondary mb-1 flex items-center gap-2">
              <History className="text-primary" size={20} />
              Historique des paiements
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Client : <span className="font-medium text-foreground">{historyModal.client}</span>
            </p>

            {historyLoading ? (
              <div className="py-8 text-center text-muted-foreground">Chargement...</div>
            ) : historyPaiements.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground italic">Aucun paiement enregistré pour cette mémoire.</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm text-left">
                    <thead className="table-header text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Montant (DT)</th>
                        <th className="px-4 py-2">Note</th>
                        <th className="px-4 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyPaiements.map((p) => (
                        <tr key={p.id} className="bg-white border-b hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">{format(new Date(p.date_paiement), 'dd/MM/yyyy')}</td>
                          <td className="px-4 py-3 font-bold text-green-700">{Number(p.montant).toFixed(3)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.note || '-'}</td>
                          <td className="px-4 py-3 flex justify-center">
                            <button
                              onClick={() => deletePaiement(p.id, historyModal.memoireId)}
                              disabled={historyDeletingId === p.id}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-full transition-colors cursor-pointer disabled:opacity-50"
                              title="Supprimer ce paiement"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex justify-between bg-muted rounded-md p-3 text-sm">
                  <span className="text-muted-foreground">Total versé :</span>
                  <span className="font-bold text-green-700">
                    {historyPaiements.reduce((acc, p) => acc + Number(p.montant), 0).toFixed(3)} DT
                  </span>
                </div>
              </>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={closeHistoryModal}
                className="px-4 py-2 rounded-md font-medium border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Memoire Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={closeEditModal}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted cursor-pointer"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-secondary mb-1 flex items-center gap-2">
              <Pencil className="text-primary" size={20} />
              Modifier la Mémoire
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Client : <span className="font-medium text-foreground">{editModal.client}</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Client <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  className="input-field"
                  value={editClient}
                  onChange={(e) => setEditClient(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Titre <span className="text-muted-foreground">(Optionnel)</span></label>
                <input
                  type="text"
                  className="input-field font-semibold"
                  placeholder="MÉMOIRE DE RÈGLEMENT"
                  value={editTitre}
                  onChange={(e) => setEditTitre(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date de Mémoire <span className="text-destructive">*</span></label>
                <input
                  type="date"
                  className="input-field cursor-pointer"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Total Prime (DT) <span className="text-destructive">*</span></label>
                <input
                  type="number"
                  step="0.001"
                  className="input-field"
                  placeholder="0.000"
                  value={editTotal}
                  onChange={(e) => setEditTotal(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeEditModal}
                className="flex-1 px-4 py-2 rounded-md font-medium border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={saveEditMemoire}
                disabled={savingEdit}
                className="flex-1 btn-primary"
              >
                <Save size={18} />
                {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setLoginModalOpen(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted cursor-pointer"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-secondary mb-4 flex items-center gap-2">
              <LogIn className="text-primary" size={20} />
              Connexion
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="hamza@shiri.tn"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mot de passe</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                />
              </div>
              {loginError && (
                <p className="text-sm text-destructive">{loginError}</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setLoginModalOpen(false)}
                className="flex-1 px-4 py-2 rounded-md font-medium border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleLogin}
                disabled={loggingIn}
                className="flex-1 btn-primary"
              >
                <LogIn size={18} />
                {loggingIn ? 'Connexion...' : 'Se connecter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Required style for next/font/google or simple tailwind animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}} />
    </div>
  );
}
