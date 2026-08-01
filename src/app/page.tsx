"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Save, List, CheckCircle, Trash2, PlusCircle, LayoutDashboard, Calculator, Percent, History } from 'lucide-react';
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
  solde_non_regle?: number | null;
  historique_paiements?: { date: string; montant: number }[] | null;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'create' | 'view'>('create');
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

  // Partial payment and history modal states
  const [partialPayMemoire, setPartialPayMemoire] = useState<MemoireDB | null>(null);
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [partialDate, setPartialDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [historyViewMemoire, setHistoryViewMemoire] = useState<MemoireDB | null>(null);

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
        pdf_url: pdfUrl,
        solde_non_regle: totalPrimes,
        historique_paiements: []
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
    } catch (error: any) {
      showToast('Erreur chargement: ' + error?.message, 'error');
    } finally {
      setFetching(false);
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const memoire = memoires.find(m => m.id === id);
      if (!memoire) throw new Error('Mémoire introuvable');

      const currentUnpaid = memoire.solde_non_regle !== undefined && memoire.solde_non_regle !== null
        ? memoire.solde_non_regle
        : (memoire.statut === 'Payée' ? 0 : memoire.total_prime);

      if (currentUnpaid <= 0) {
        showToast('Cette mémoire est déjà entièrement payée', 'error');
        return;
      }

      const newPayment = { date: today, montant: currentUnpaid };
      const currentHistory = memoire.historique_paiements || (memoire.statut === 'Payée' && memoire.date_paiement ? [{ date: memoire.date_paiement, montant: memoire.total_prime }] : []);
      const newHistory = [...currentHistory, newPayment];

      const { error } = await supabase
        .from('memoires')
        .update({ 
          statut: 'Payée', 
          date_paiement: today,
          solde_non_regle: 0,
          historique_paiements: newHistory
        })
        .eq('id', id);

      if (error) throw error;

      showToast('Mémoire marquée comme payée', 'success');
      // Update UI immediately
      setMemoires(memoires.map(m => m.id === id ? { 
        ...m, 
        statut: 'Payée', 
        date_paiement: today,
        solde_non_regle: 0,
        historique_paiements: newHistory
      } : m));
    } catch (error: any) {
      showToast('Erreur mise à jour: ' + error?.message, 'error');
    }
  };

  const handlePartialLiquidation = async (id: string, amount: number, date: string) => {
    setLoading(true);
    try {
      const memoire = memoires.find(m => m.id === id);
      if (!memoire) throw new Error('Mémoire introuvable');

      const currentUnpaid = memoire.solde_non_regle !== undefined && memoire.solde_non_regle !== null
        ? memoire.solde_non_regle
        : (memoire.statut === 'Payée' ? 0 : memoire.total_prime);
        
      const newUnpaid = Math.max(0, currentUnpaid - amount);
      const newStatus = newUnpaid === 0 ? 'Payée' : 'Partiellement payée';
      
      const newPayment = { date, montant: amount };
      const currentHistory = memoire.historique_paiements || (memoire.statut === 'Payée' && memoire.date_paiement ? [{ date: memoire.date_paiement, montant: memoire.total_prime }] : []);
      const newHistory = [...currentHistory, newPayment];

      const updatePayload: any = {
        statut: newStatus,
        solde_non_regle: newUnpaid,
        historique_paiements: newHistory
      };

      if (newStatus === 'Payée') {
        updatePayload.date_paiement = date;
      }

      const { error } = await supabase
        .from('memoires')
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;

      showToast('Paiement partiel enregistré', 'success');
      
      // Update state locally
      setMemoires(memoires.map(m => m.id === id ? { 
        ...m, 
        ...updatePayload 
      } : m));
      
      setPartialPayMemoire(null);
    } catch (error: any) {
      showToast('Erreur lors du paiement: ' + error?.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'view') {
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
                      <th className="px-6 py-3">Solde Restant (DT)</th>
                      <th className="px-6 py-3">Statut</th>
                      <th className="px-6 py-3">Date de Paiement</th>
                      <th className="px-6 py-3 rounded-tr-lg text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fetching ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                          Chargement des données...
                        </td>
                      </tr>
                    ) : memoires.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground italic">
                          Aucune mémoire enregistrée.
                        </td>
                      </tr>
                    ) : (
                      memoires.map((m) => {
                        const unpaidBalance = m.solde_non_regle !== undefined && m.solde_non_regle !== null
                          ? m.solde_non_regle
                          : (m.statut === 'Payée' ? 0 : m.total_prime);
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
                            <td className="px-6 py-4 font-bold text-amber-600">
                              {Number(unpaidBalance).toFixed(3)}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                m.statut === 'Payée' ? 'bg-green-100 text-green-800' :
                                m.statut === 'Partiellement payée' ? 'bg-blue-100 text-blue-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {m.statut}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-muted-foreground">
                              {m.date_paiement ? format(new Date(m.date_paiement), 'dd/MM/yyyy') : '-'}
                            </td>
                            <td className="px-6 py-4 flex justify-center items-center gap-2 flex-wrap">
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
                                <>
                                  <button
                                    onClick={() => {
                                      setPartialPayMemoire(m);
                                      setPartialAmount('');
                                      setPartialDate(new Date().toISOString().split('T')[0]);
                                    }}
                                    className="bg-amber-500 text-white hover:bg-amber-600 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                    title="Liquider Partiellement"
                                  >
                                    <Percent size={16} />
                                    Partiel
                                  </button>
                                  <button
                                    onClick={() => markAsPaid(m.id)}
                                    className="bg-[#A1C936] text-white hover:bg-[#8cb52b] px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                    title="Liquider entièrement"
                                  >
                                    <CheckCircle size={16} />
                                    Liquider
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => setHistoryViewMemoire(m)}
                                className="bg-sky-600 text-white hover:bg-sky-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                title="Historique des paiements"
                              >
                                <History size={16} />
                                Historique
                              </button>
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
      </main>

      {/* Modal Liquider Partiellement */}
      {partialPayMemoire && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-border text-foreground">
            <div className="p-6 border-b border-border bg-gray-50">
              <h3 className="text-lg font-bold text-secondary">Liquider Partiellement</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Client: {partialPayMemoire.client} | Reste à régler: {Number(partialPayMemoire.solde_non_regle !== undefined && partialPayMemoire.solde_non_regle !== null ? partialPayMemoire.solde_non_regle : (partialPayMemoire.statut === 'Payée' ? 0 : partialPayMemoire.total_prime)).toFixed(3)} DT
              </p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const amt = parseFloat(partialAmount);
              if (isNaN(amt) || amt <= 0) {
                showToast('Veuillez entrer un montant valide', 'error');
                return;
              }
              const currentUnpaid = partialPayMemoire.solde_non_regle !== undefined && partialPayMemoire.solde_non_regle !== null ? partialPayMemoire.solde_non_regle : (partialPayMemoire.statut === 'Payée' ? 0 : partialPayMemoire.total_prime);
              if (amt > currentUnpaid) {
                showToast('Le montant ne peut pas dépasser le solde restant', 'error');
                return;
              }
              handlePartialLiquidation(partialPayMemoire.id, amt, partialDate);
            }} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Montant à liquider (DT) <span className="text-destructive">*</span></label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={Number(partialPayMemoire.solde_non_regle !== undefined && partialPayMemoire.solde_non_regle !== null ? partialPayMemoire.solde_non_regle : (partialPayMemoire.statut === 'Payée' ? 0 : partialPayMemoire.total_prime)).toFixed(3)}
                  className="input-field font-semibold text-lg text-secondary"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date de paiement <span className="text-destructive">*</span></label>
                <input
                  type="date"
                  className="input-field"
                  value={partialDate}
                  onChange={(e) => setPartialDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPartialPayMemoire(null)}
                  className="px-4 py-2 border border-border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary py-2 px-4 text-sm cursor-pointer"
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historique des Paiements */}
      {historyViewMemoire && (() => {
        const currentUnpaid = historyViewMemoire.solde_non_regle !== undefined && historyViewMemoire.solde_non_regle !== null ? historyViewMemoire.solde_non_regle : (historyViewMemoire.statut === 'Payée' ? 0 : historyViewMemoire.total_prime);
        const total = Number(historyViewMemoire.total_prime);
        const paidHistory = historyViewMemoire.historique_paiements || (historyViewMemoire.statut === 'Payée' && historyViewMemoire.date_paiement ? [{ date: historyViewMemoire.date_paiement, montant: total }] : []);
        const totalPaid = paidHistory.reduce((acc, curr) => acc + Number(curr.montant), 0);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-border text-foreground">
              <div className="p-6 border-b border-border bg-gray-50 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-secondary">Historique des Paiements</h3>
                  <p className="text-xs text-muted-foreground mt-1">Client: {historyViewMemoire.client}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  historyViewMemoire.statut === 'Payée' ? 'bg-green-100 text-green-800' : 
                  historyViewMemoire.statut === 'Partiellement payée' ? 'bg-blue-100 text-blue-800' : 
                  'bg-red-100 text-red-800'
                }`}>
                  {historyViewMemoire.statut}
                </span>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="max-h-[250px] overflow-y-auto border border-border rounded-md">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-700 border-b border-border">
                      <tr>
                        <th className="px-4 py-2 text-center">N°</th>
                        <th className="px-4 py-2">Date de Paiement</th>
                        <th className="px-4 py-2 text-right">Montant (DT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidHistory.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground italic">
                            Aucun paiement enregistré pour cette mémoire.
                          </td>
                        </tr>
                      ) : (
                        paidHistory.map((p, index) => (
                          <tr key={index} className="border-b border-border hover:bg-gray-50/50">
                            <td className="px-4 py-2 text-center font-medium text-gray-500">{index + 1}</td>
                            <td className="px-4 py-2">{format(new Date(p.date), 'dd/MM/yyyy')}</td>
                            <td className="px-4 py-2 text-right font-bold text-secondary">{Number(p.montant).toFixed(3)} DT</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-gray-50 p-4 rounded-md border border-border space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Mémoire :</span>
                    <span className="font-semibold text-gray-700">{total.toFixed(3)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Réglé :</span>
                    <span className="font-semibold text-green-600">{totalPaid.toFixed(3)} DT</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                    <span className="text-secondary">Solde Restant :</span>
                    <span className="text-amber-600">{currentUnpaid.toFixed(3)} DT</span>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setHistoryViewMemoire(null)}
                    className="btn-secondary py-2 px-4 text-sm cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
