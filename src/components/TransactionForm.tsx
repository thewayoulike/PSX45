import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Transaction, Broker, ParsedTrade, EditableTrade, PortfolioType } from '../types';
import { X, Plus, ChevronDown, Loader2, Save, Sparkles, ScanText, Keyboard, FileText, FileSpreadsheet, Search, AlertTriangle, History, Wallet, ArrowRightLeft, Briefcase, RefreshCcw, CalendarClock, AlertCircle, Lock, CheckSquare, TrendingUp, TrendingDown, DollarSign, Download, Upload, Settings2, AlignLeft, Calculator, Mail, Paperclip, DownloadCloud, Coins, Search as SearchIcon, Info, BookOpen } from 'lucide-react';
import { parseTradeDocumentOCRSpace } from '../services/ocrSpace';
import { parseTradeDocument, parseFundBalanceDocument } from '../services/gemini';
import { fundScanToTrades } from '../services/fundImport';
import { searchGmailMessages, downloadGmailAttachment } from '../services/driveStorage';
import { exportToCSV } from '../utils/export';
import { todayPK, toDatePK } from '../utils/dates';
import { FundPicker } from './FundPicker';
import { MutualFundRecord } from '../services/mufapData';
import { isFundTicker } from '../utils/fundId';
import { formatTransactionLabel } from '../utils/fundDisplay';
import { dpFundNav, dpFundUnits, roundFundNav, roundFundUnits } from '../utils/fundFormat';
import * as XLSX from 'xlsx';

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, 'id' | 'portfolioId'>) => void;
  onUpdateTransaction?: (transaction: Transaction) => void;
  onManageBrokers?: () => void;
  isOpen: boolean;
  onClose: () => void;
  existingTransactions?: Transaction[];
  editingTransaction?: Transaction | null;
  brokers?: Broker[]; 
  portfolioDefaultBrokerId?: string;
  portfolioType?: PortfolioType;
  fundCatalog?: Record<string, MutualFundRecord>;
  onRefreshFundCatalog?: () => void;
  freeCash?: number;
  savedScannedTrades?: EditableTrade[];
  onSaveScannedTrades?: (trades: EditableTrade[]) => void;
}

const normalizeDate = (input: any): string => toDatePK(input);

/** Compare cash amounts in PKR with 1-paisa tolerance (avoids float/display rounding false rejects). */
const roundMoney = (n: number) => Math.round(n * 100) / 100;
const canAfford = (cost: number, available: number) => roundMoney(cost) <= roundMoney(available) + 0.01;

const getRowValue = (row: any, aliases: string[]): number => {
    const rowKeys = Object.keys(row);
    for (const alias of aliases) {
        const match = rowKeys.find(k => k.toLowerCase().trim() === alias.toLowerCase().trim());
        if (match) {
            const val = row[match];
            const cleanVal = typeof val === 'string' ? val.replace(/,/g, '').replace(/Rs\.?/gi, '') : val;
            const num = Number(cleanVal);
            if (!isNaN(num)) return num;
        }
    }
    return 0;
};

export const TransactionForm: React.FC<TransactionFormProps> = ({ 
  onAddTransaction, 
  onUpdateTransaction,
  onManageBrokers,
  isOpen, 
  onClose, 
  existingTransactions = [], 
  editingTransaction,
  brokers = [],
  portfolioDefaultBrokerId,
  portfolioType = 'PSX',
  fundCatalog = {},
  onRefreshFundCatalog,
  freeCash,
  savedScannedTrades = [],
  onSaveScannedTrades
}) => {
  const isFundPortfolio = portfolioType === 'MUTUAL_FUND';
  const [mode, setMode] = useState<'MANUAL' | 'IMPORT' | 'AI_SCAN' | 'OCR_SCAN' | 'EMAIL_IMPORT'>('MANUAL');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'DIVIDEND_REINVEST' | 'REFUND_OF_CAPITAL' | 'TAX' | 'HISTORY' | 'DEPOSIT' | 'WITHDRAWAL' | 'ANNUAL_FEE' | 'OTHER'>('BUY');
  
  const [date, setDate] = useState(todayPK());
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  const [commission, setCommission] = useState<number | ''>('');
  const [tax, setTax] = useState<number | ''>('');
  const [cdcCharges, setCdcCharges] = useState<number | ''>('');
  const [otherFees, setOtherFees] = useState<number | ''>('');
  const [isAutoCalc, setIsAutoCalc] = useState(true);
  const [notes, setNotes] = useState('');
  /**
   * Fund subscriptions/redemptions usually move money to or from the bank, so by
   * default we book the matching cash row too. Unticked, the trade settles
   * against cash already in the portfolio — e.g. a switch between two funds.
   */
  const [pairCash, setPairCash] = useState(true);
  const [selectedFund, setSelectedFund] = useState<MutualFundRecord | null>(null);

  // In a fund, a reinvested dividend is paid as units at that day's NAV rather than
  // as a rupee amount, so it is captured like a trade (fund + units + NAV).
  const fundUnitReinvest = isFundPortfolio && type === 'DIVIDEND_REINVEST';

  // Net cash the paired row would move: cost including fees on a buy, proceeds after fees on a sell.
  const pairAmount = (() => {
    const gross = (Number(quantity) || 0) * (Number(price) || 0);
    if (gross <= 0) return 0;
    const fees = (Number(commission) || 0) + (Number(tax) || 0) + (Number(cdcCharges) || 0) + (Number(otherFees) || 0);
    return Math.max(0, type === 'SELL' ? gross - fees : gross + fees);
  })();
  const [fundNavLoading, setFundNavLoading] = useState(false);
  const [showFundGuide, setShowFundGuide] = useState(true);
  const [fundScanHint, setFundScanHint] = useState<string | null>(null);
  const [fundScanInstructions, setFundScanInstructions] = useState(() => {
      try { return localStorage.getItem('psx_fund_scan_instructions') || ''; } catch { return ''; }
  });
  const [showFundScanHelp, setShowFundScanHelp] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedScanIndices, setSelectedScanIndices] = useState<Set<number>>(new Set());

  const [formError, setFormError] = useState<string | null>(null);
  const [histAmount, setHistAmount] = useState<number | ''>('');
  const [histTaxType, setHistTaxType] = useState<'BEFORE_TAX' | 'AFTER_TAX'>('AFTER_TAX');
  const [category, setCategory] = useState<'ADJUSTMENT' | 'OTHER_TAX' | 'CDC_CHARGE'>('ADJUSTMENT');
  
  const [emailQuery, setEmailQuery] = useState('');
  const [emailSender, setEmailSender] = useState('');
  const [emailMessages, setEmailMessages] = useState<any[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const updateScannedTrades = (trades: EditableTrade[]) => {
      if (onSaveScannedTrades) onSaveScannedTrades(trades);
  };

  const scanTotals = useMemo(() => {
      let totalBuy = 0;
      let totalSell = 0;
      let totalDeposit = 0;
      savedScannedTrades.forEach(t => {
          const val = Number(t.quantity) * Number(t.price);
          const fees = (Number(t.commission)||0) + (Number(t.tax)||0) + (Number(t.cdcCharges)||0) + (Number(t.otherFees)||0);
          if (t.type === 'BUY') totalBuy += (val + fees);
          else if (t.type === 'SELL') totalSell += (val - fees);
          else if (t.type === 'DIVIDEND') totalSell += (val - (Number(t.tax)||0) - (Number(t.otherFees)||0));
          else if (t.type === 'DEPOSIT') totalDeposit += Number(t.price);
      });
      return { totalBuy, totalSell, totalDeposit, net: totalSell - totalBuy + totalDeposit };
  }, [savedScannedTrades]);

  const calculateFeesForTrade = (tradeType: string, qty: number, prc: number, brokerId: string) => {
      if (qty <= 0 || prc <= 0) return { commission: 0, tax: 0, cdcCharges: 0 };
      const gross = qty * prc;
      let estComm = 0; let estTax = 0; let estCdc = 0;
      if (tradeType === 'DIVIDEND') {
          estTax = gross * 0.15;
      } else {
          const currentBroker = brokers.find(b => b.id === brokerId);
          if (currentBroker) {
              if (currentBroker.commissionType === 'PERCENTAGE') estComm = gross * (currentBroker.rate1 / 100);
              else if (currentBroker.commissionType === 'FIXED') estComm = currentBroker.rate1;
              else if (currentBroker.commissionType === 'PER_SHARE') estComm = qty * currentBroker.rate1;
              else if (currentBroker.commissionType === 'HIGHER_OF') { const pct = gross * (currentBroker.rate1 / 100); const fixed = qty * (currentBroker.rate2 || 0); estComm = Math.max(pct, fixed); }
              else if (currentBroker.commissionType === 'SLAB' && currentBroker.slabs) {
                  const slab = currentBroker.slabs.find(s => prc >= s.min && prc <= s.max);
                  let slabComm = 0;
                  if (slab) { if (slab.type === 'FIXED') slabComm = qty * slab.rate; else if (slab.type === 'PERCENTAGE') slabComm = gross * (slab.rate / 100); }
                  if (currentBroker.rate1 && currentBroker.rate1 > 0) { const pctComm = gross * (currentBroker.rate1 / 100); estComm = Math.max(slabComm, pctComm); } else { estComm = slabComm; }
              }
              const taxRate = (currentBroker.sstRate / 100);
              estTax = estComm * taxRate;
              const cdcType = currentBroker.cdcType || 'PER_SHARE';
              const cdcRate = currentBroker.cdcRate !== undefined ? currentBroker.cdcRate : 0.005;
              if (cdcType === 'PER_SHARE') estCdc = qty * cdcRate;
              else if (cdcType === 'FIXED') estCdc = cdcRate;
              else if (cdcType === 'HIGHER_OF') { const shareVal = qty * cdcRate; const fixedVal = currentBroker.cdcMin || 0; estCdc = Math.max(shareVal, fixedVal); }
          } else {
              estComm = gross * 0.0015; estTax = estComm * 0.15; estCdc = qty * 0.005;
          }
      }
      return { commission: parseFloat(estComm.toFixed(2)), tax: parseFloat(estTax.toFixed(2)), cdcCharges: parseFloat(estCdc.toFixed(2)) };
  };

  const handleAutoFillFees = () => {
      const updatedTrades = savedScannedTrades.map(trade => {
          const targetBrokerId = trade.brokerId || selectedBrokerId;
          if (!targetBrokerId) return trade; 
          const fees = calculateFeesForTrade(trade.type, Number(trade.quantity), Number(trade.price), targetBrokerId);
          return { ...trade, commission: fees.commission, tax: fees.tax, cdcCharges: fees.cdcCharges, brokerId: targetBrokerId };
      });
      updateScannedTrades(updatedTrades);
  };

  const handleEmailSearch = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!emailQuery && !emailSender) return;
      setLoadingEmails(true); setEmailMessages([]); setScanError(null);
      try {
          let q = ''; if (emailSender) q += `from:${emailSender} `; if (emailQuery) q += `subject:(${emailQuery}) `;
          const msgs = await searchGmailMessages(q.trim());
          setEmailMessages(msgs);
          if (msgs.length === 0) { setScanError("No emails with attachments found matching criteria."); }
      } catch (err: any) { setScanError(err.message); } finally { setLoadingEmails(false); }
  };

  const handleSelectAttachment = async (msgId: string, att: any) => {
      setDownloadingAttachment(true);
      try {
          const file = await downloadGmailAttachment(msgId, att.id, att.filename, att.mimeType);
          if (file) { setSelectedFile(file); setMode('AI_SCAN'); setScanError(null); } else { setScanError("Failed to download attachment."); }
      } catch (e) { setScanError("Error processing attachment."); } finally { setDownloadingAttachment(false); }
  };

  useEffect(() => {
    if (isOpen) {
        if (portfolioDefaultBrokerId) { setSelectedBrokerId(portfolioDefaultBrokerId); } else if (brokers.length > 0 && !selectedBrokerId) { const def = brokers.find(b => b.isDefault) || brokers[0]; if (def) setSelectedBrokerId(def.id); }
    }
  }, [isOpen, brokers, selectedBrokerId, portfolioDefaultBrokerId]);

  useEffect(() => {
    if (isOpen) {
        setFormError(null); 
        setFundScanHint(null);
        const activeBroker = brokers.find(b => b.id === selectedBrokerId);
        if (activeBroker && activeBroker.email && !emailSender) {
            setEmailSender(activeBroker.email);
        }
        
        if (editingTransaction) {
            setMode('MANUAL'); setType(editingTransaction.type); setDate(editingTransaction.date); setTicker(editingTransaction.ticker); setQuantity(editingTransaction.quantity); setPrice(editingTransaction.price); setCommission(editingTransaction.commission); setTax(editingTransaction.tax || 0); setCdcCharges(editingTransaction.cdcCharges || 0); setOtherFees(editingTransaction.otherFees || 0); setNotes(editingTransaction.notes || ''); setIsAutoCalc(false); if (editingTransaction.brokerId) setSelectedBrokerId(editingTransaction.brokerId);
            setSelectedFund(isFundTicker(editingTransaction.ticker) ? (fundCatalog[editingTransaction.ticker] || null) : null);
            if (editingTransaction.type === 'TAX') { setPrice(editingTransaction.price); setHistAmount(editingTransaction.price); }
            if (editingTransaction.type === 'HISTORY') { setHistAmount(editingTransaction.price); setHistTaxType(editingTransaction.tax > 0 ? 'BEFORE_TAX' : 'AFTER_TAX'); }
            if (['DEPOSIT', 'WITHDRAWAL', 'ANNUAL_FEE', 'DIVIDEND_REINVEST'].includes(editingTransaction.type)) { setHistAmount(editingTransaction.price); }
            if (editingTransaction.type === 'OTHER') { setCategory(editingTransaction.category || 'ADJUSTMENT'); setHistAmount(editingTransaction.price); }
        } else {
            setTicker(''); setQuantity(''); setPrice(''); setCommission(''); setTax(''); setCdcCharges(''); setOtherFees(''); setNotes(''); setSelectedFund(null); if (savedScannedTrades.length > 0) {} else { setMode('MANUAL'); } setIsAutoCalc(!isFundPortfolio); setDate(todayPK()); setHistAmount(''); setHistTaxType('AFTER_TAX'); setCategory('ADJUSTMENT'); setScanError(null); setSelectedFile(null); setEmailMessages([]); setEmailQuery('');
            if (portfolioDefaultBrokerId) setSelectedBrokerId(portfolioDefaultBrokerId);
        }
    }
  }, [isOpen, editingTransaction, portfolioDefaultBrokerId, fundCatalog, isFundPortfolio]); 

  useEffect(() => {
    if (!isFundPortfolio || !selectedFund) return;
    if (type === 'BUY') setPrice(selectedFund.offer || selectedFund.nav);
    else if (type === 'SELL') setPrice(selectedFund.repurchase || selectedFund.nav);
    else if (type === 'DIVIDEND' || type === 'DIVIDEND_REINVEST' || type === 'REFUND_OF_CAPITAL') setPrice(selectedFund.nav);
  }, [isFundPortfolio, selectedFund, type]);

  useEffect(() => {
     if (mode === 'EMAIL_IMPORT') {
         const activeBroker = brokers.find(b => b.id === selectedBrokerId);
         if (activeBroker && activeBroker.email) {
             setEmailSender(activeBroker.email);
         }
     }
  }, [selectedBrokerId, mode]);

  useEffect(() => { setSelectedScanIndices(new Set()); }, [savedScannedTrades, mode]);

  useEffect(() => {
    if (mode !== 'MANUAL') return;

    // Cash / adjustment types — same for PSX and mutual fund portfolios
    if (type === 'TAX' && typeof histAmount === 'number') {
        setPrice(histAmount); setQuantity(1); setTicker('CGT'); setCommission(0); setTax(0); setCdcCharges(0); setOtherFees(0);
    } else if (type === 'HISTORY' && typeof histAmount === 'number') {
        setQuantity(1); setTicker('PREV-PNL');
        if (histTaxType === 'BEFORE_TAX') {
            if (histAmount > 0) { const t = histAmount * 0.15; setTax(parseFloat(t.toFixed(2))); } else setTax(0);
        } else setTax(0);
        setPrice(histAmount); setCommission(0); setCdcCharges(0); setOtherFees(0);
    } else if (!fundUnitReinvest && (type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'ANNUAL_FEE' || type === 'DIVIDEND_REINVEST') && typeof histAmount === 'number') {
        setQuantity(1);
        setTicker(type === 'ANNUAL_FEE' ? 'ANNUAL FEE' : type === 'DIVIDEND_REINVEST' ? 'DIV REINVEST' : 'CASH');
        setPrice(histAmount); setCommission(0); setTax(0); setCdcCharges(0); setOtherFees(0);
    } else if (type === 'OTHER' && typeof histAmount === 'number') {
        setQuantity(1);
        setTicker(category === 'ADJUSTMENT' ? 'ADJUSTMENT' : category === 'CDC_CHARGE' ? 'CDC CHARGE' : 'OTHER FEE');
        setPrice(histAmount); setCommission(0); setTax(0); setCdcCharges(0); setOtherFees(0);
    } else if (isAutoCalc && !isFundPortfolio && typeof quantity === 'number' && quantity > 0 && typeof price === 'number' && price > 0) {
        const fees = calculateFeesForTrade(type, quantity, price, selectedBrokerId);
        setCommission(fees.commission);
        setTax(fees.tax);
        setCdcCharges(fees.cdcCharges);
    }
  }, [quantity, price, isAutoCalc, mode, editingTransaction, selectedBrokerId, brokers, type, histAmount, histTaxType, category, isFundPortfolio]);

  const getHoldingQty = (ticker: string, brokerId: string) => {
      let qty = 0;
      if (isFundTicker(ticker)) {
          existingTransactions.forEach(t => {
              if (t.ticker === ticker) {
                  if (t.type === 'BUY' || t.type === 'TRANSFER_IN' || t.type === 'DIVIDEND_REINVEST' || t.type === 'REFUND_OF_CAPITAL') qty += t.quantity;
                  if (t.type === 'SELL' || t.type === 'TRANSFER_OUT') qty -= t.quantity;
              }
          });
          return Math.max(0, qty);
      }
      const cleanTicker = ticker.toUpperCase();
      const brokerObj = brokers.find(b => b.id === brokerId);
      const brokerName = brokerObj?.name;
      existingTransactions.forEach(t => {
          const isSameBroker = t.brokerId === brokerId || (t.broker && brokerName && t.broker === brokerName);
          if (t.ticker === cleanTicker && isSameBroker) {
              if (t.type === 'BUY') qty += t.quantity;
              if (t.type === 'SELL') qty -= t.quantity;
          }
      });
      return Math.max(0, qty);
  };
  
  const fundDisplayNames = useMemo(() => {
      const map: Record<string, string> = {};
      Object.values(fundCatalog).forEach(f => { map[f.id] = f.fundName; });
      return map;
  }, [fundCatalog]);

  const scanFundLabel = (t: EditableTrade) =>
      formatTransactionLabel(t.ticker, fundDisplayNames, t.notes);

  const handleDownloadTemplate = () => { const templateData = [ { Date: todayPK(), Type: 'BUY', Ticker: 'OGDC', Broker: brokers.length > 0 ? brokers[0].name : 'My Broker', Quantity: 500, Price: 120.50, Commission: 150, Tax: 20, 'CDC Charges': 5, 'Other Fees': 0, Notes: 'Sample Entry (Delete this row)' } ]; exportToCSV(templateData, 'PSX_Tracker_Import_Template'); };

  
  const handleManualSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      const cleanTicker = isFundPortfolio ? ticker : ticker.toUpperCase();
      if (isFundPortfolio && (type === 'BUY' || type === 'SELL' || type === 'DIVIDEND') && !cleanTicker) {
          setFormError('Please select a mutual fund.');
          return;
      }
      let brokerName: string | undefined;
      const b = brokers.find(b => b.id === selectedBrokerId);
      if (!isFundPortfolio && b) brokerName = b.name;
      const cashTypes = ['DEPOSIT', 'WITHDRAWAL', 'ANNUAL_FEE', 'DIVIDEND_REINVEST'] as const;
      if (cashTypes.includes(type as typeof cashTypes[number])) {
          const amt = Number(histAmount);
          if (!amt || amt <= 0) {
              setFormError('Please enter an amount greater than zero.');
              return;
          }
      } else if (type === 'OTHER') {
          const amt = Number(histAmount);
          if (!amt || amt === 0) {
              setFormError('Please enter an amount.');
              return;
          }
      } else if (type === 'TAX' || type === 'HISTORY') {
          const amt = Number(histAmount);
          if (amt === 0 || histAmount === '') {
              setFormError('Please enter an amount.');
              return;
          }
      }

      let qtyNum = Number(quantity);
      let priceNum = Number(price);
      let resolvedTicker = cleanTicker;

      if (isFundPortfolio && (fundUnitReinvest || type === 'REFUND_OF_CAPITAL' || (!cashTypes.includes(type as typeof cashTypes[number]) && type !== 'TAX' && type !== 'HISTORY' && type !== 'OTHER'))) {
          qtyNum = roundFundUnits(qtyNum);
          priceNum = roundFundNav(priceNum);
      }

      if (!fundUnitReinvest && cashTypes.includes(type as typeof cashTypes[number])) {
          qtyNum = 1;
          priceNum = Number(histAmount);
          resolvedTicker = type === 'ANNUAL_FEE' ? 'ANNUAL FEE' : type === 'DIVIDEND_REINVEST' ? 'DIV REINVEST' : 'CASH';
      } else if (type === 'TAX') {
          qtyNum = 1;
          priceNum = Number(histAmount);
          resolvedTicker = 'CGT';
      } else if (type === 'HISTORY') {
          qtyNum = 1;
          priceNum = Number(histAmount);
          resolvedTicker = 'PREV-PNL';
      } else if (type === 'OTHER') {
          qtyNum = 1;
          priceNum = Number(histAmount);
          resolvedTicker = category === 'ADJUSTMENT' ? 'ADJUSTMENT' : category === 'CDC_CHARGE' ? 'CDC CHARGE' : 'OTHER FEE';
      }

      const unitLabel = isFundPortfolio ? 'units' : 'shares';
      if (type === 'SELL') {
          const heldQty = getHoldingQty(cleanTicker, selectedBrokerId);
          let adjustedQty = heldQty;
          if (editingTransaction && editingTransaction.type === 'SELL' && editingTransaction.ticker === cleanTicker) adjustedQty += editingTransaction.quantity;
          else if (editingTransaction && editingTransaction.type === 'BUY' && editingTransaction.ticker === cleanTicker) adjustedQty -= editingTransaction.quantity;
          if (qtyNum > adjustedQty) {
              setFormError(`Insufficient holdings! You only have ${adjustedQty} ${unitLabel} of ${selectedFund?.fundName || cleanTicker}.`);
              return;
          }
      }
      // A paired deposit funds the purchase itself, so existing cash is irrelevant.
      const pairsCash = isFundPortfolio && pairCash && (type === 'BUY' || type === 'SELL');
      if (type === 'BUY' && !editingTransaction && freeCash !== undefined && !pairsCash) {
          const totalCost = (qtyNum * priceNum) + Number(commission) + Number(tax) + Number(cdcCharges) + Number(otherFees);
          if (!canAfford(totalCost, freeCash)) {
              setFormError(`Insufficient Buying Power! You need Rs. ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} but only have Rs. ${freeCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
              return;
          }
      }
      const txData: any = {
          ticker: resolvedTicker,
          type,
          quantity: qtyNum,
          price: priceNum,
          date,
          broker: brokerName,
          brokerId: isFundPortfolio ? undefined : selectedBrokerId,
          commission: Number(commission) || 0,
          tax: Number(tax) || 0,
          cdcCharges: isFundPortfolio ? 0 : (Number(cdcCharges) || 0),
          otherFees: Number(otherFees) || 0,
          category: type === 'OTHER' ? category : undefined,
          notes: notes.trim() || undefined,
          pairCash: pairsCash || undefined,
      };
      if (editingTransaction && onUpdateTransaction) onUpdateTransaction({ ...editingTransaction, ...txData });
      else onAddTransaction(txData);
      onClose();
  };
  
  // FIXED: ADDED handleFileSelect FUNCTION BACK
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { 
      if (e.target.files && e.target.files[0]) { 
          setSelectedFile(e.target.files[0]); 
          setScanError(null); 
          updateScannedTrades([]); 
      } 
  };
  
  const handleImportFile = async () => { if (!selectedFile) return; setIsScanning(true); setScanError(null); updateScannedTrades([]); try { const data = await selectedFile.arrayBuffer(); const workbook = XLSX.read(data); const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const jsonData = XLSX.utils.sheet_to_json(worksheet); const trades: EditableTrade[] = jsonData.map((row: any) => { const comm = getRowValue(row, ['Commission', 'Comm', 'Brokerage', 'Trading Fee']); const tax = getRowValue(row, ['Tax', 'SST', 'WHT', 'Sales Tax', 'Govt Tax']); const cdc = getRowValue(row, ['CDC Charges', 'CDC', 'CDC Fee', 'Regulatory Fee', 'Reg Fee']); const other = getRowValue(row, ['Other Fees', 'Other', 'FED', 'Service Charges', 'Misc', 'Tax 2']); const price = getRowValue(row, ['Price', 'Rate', 'Exec Price']); const qty = getRowValue(row, ['Quantity', 'Qty', 'Volume']); const type = row['Type'] ? row['Type'].toString().toUpperCase() : 'BUY'; const ticker = row['Ticker'] ? row['Ticker'].toString().toUpperCase() : row['Symbol'] ? row['Symbol'].toString().toUpperCase() : ''; const dateVal = row['Date'] || row['Trade Date']; return { date: normalizeDate(dateVal), type, ticker, broker: row['Broker'], quantity: qty || 0, price: dp2(price), commission: dp2(comm), tax: dp2(tax), cdcCharges: dp2(cdc), otherFees: dp2(other), brokerId: brokers.find(b => b.name.toLowerCase() === (row['Broker'] || '').toLowerCase())?.id }; }).filter((t: any) => t.ticker && t.quantity > 0 && t.price > 0); if (trades.length === 0) throw new Error("No valid trades found. Please check column headers."); updateScannedTrades(trades); } catch (e: any) { setScanError("Failed to parse file. Ensure it is a valid Excel/CSV."); } finally { setIsScanning(false); } };
  
  const handleProcessScan = async () => { 
      if (!selectedFile) return; 
      if (mode === 'IMPORT') { handleImportFile(); return; } 
      
      setIsScanning(true); 
      setScanError(null); 
      updateScannedTrades([]); 
      
      try { 
          if (isFundPortfolio && mode === 'AI_SCAN') {
              try { localStorage.setItem('psx_fund_scan_instructions', fundScanInstructions); } catch { /* ignore */ }
              const scan = await parseFundBalanceDocument(selectedFile, { customInstructions: fundScanInstructions });
              const hasHoldings = (scan.holdings?.length || 0) > 0;
              const hasFlows = (scan.cashFlows?.length || 0) > 0;
              if (!hasHoldings && !hasFlows) {
                  throw new Error("No fund holdings or cash activity found. Upload a balance summary or transaction statement, and add read tips below if the layout is unusual.");
              }
              const { trades, warnings } = fundScanToTrades(scan, fundCatalog, todayPK());
              if (trades.length === 0) throw new Error("No importable rows found in the statement.");
              const cashLike = new Set(['DEPOSIT', 'HISTORY', 'WITHDRAWAL', 'TAX', 'DIVIDEND', 'DIVIDEND_REINVEST', 'OTHER']);
              updateScannedTrades(trades.map(t => ({
                  ...t,
                  quantity: isFundPortfolio && !cashLike.has(t.type)
                      ? roundFundUnits(Number(t.quantity))
                      : t.quantity,
                  price: typeof t.price === 'number'
                      ? (isFundPortfolio && !cashLike.has(t.type) ? Number(dpFundNav(t.price)) : t.price)
                      : Number(t.price),
                  brokerId: isFundPortfolio ? undefined : (selectedBrokerId || undefined),
                  broker: isFundPortfolio ? undefined : (selectedBrokerId ? brokers.find(b => b.id === selectedBrokerId)?.name : t.broker),
              })));
              const hintParts = [
                  hasFlows
                      ? 'Activity statement detected — review Deposit / Withdrawal / Subscribe / Redeem / Dividend / Tax rows.'
                      : 'Balance summary — review Deposit + Subscribe (BUY) per fund.',
                  warnings.length > 0 ? `Notes: ${warnings.slice(0, 4).join('; ')}${warnings.length > 4 ? '…' : ''}` : null,
              ].filter(Boolean);
              setFundScanHint(hintParts.join(' '));
              return;
          }

          let trades: ParsedTrade[] = []; 
          if (mode === 'AI_SCAN') { 
              trades = await parseTradeDocument(selectedFile); 
          } else { 
              const res = await parseTradeDocumentOCRSpace(selectedFile); 
              trades = res.trades; 
          } 
          
          if (trades.length === 0) throw new Error("No trades found in this file."); 
          
          const enrichedTrades: EditableTrade[] = trades.map(t => ({ 
              ...t, 
              price: dp2(t.price), 
              commission: dp2(t.commission), 
              tax: dp2(t.tax), 
              cdcCharges: dp2(t.cdcCharges), 
              otherFees: dp2(t.otherFees), 
              brokerId: isFundPortfolio ? undefined : (selectedBrokerId || undefined), 
              broker: isFundPortfolio ? undefined : (selectedBrokerId ? brokers.find(b => b.id === selectedBrokerId)?.name : t.broker),
          })); 
          
          updateScannedTrades(enrichedTrades); 
      } catch (err: any) { 
          setScanError(err.message || "Failed to scan document."); 
      } finally { 
          setIsScanning(false); 
      } 
  };
  
  const toggleScanSelection = (index: number) => { const next = new Set(selectedScanIndices); if (next.has(index)) next.delete(index); else next.add(index); setSelectedScanIndices(next); };
  const toggleSelectAll = () => { if (selectedScanIndices.size === savedScannedTrades.length) setSelectedScanIndices(new Set()); else setSelectedScanIndices(new Set(savedScannedTrades.map((_, i) => i))); };
  const getTradeCost = (t: EditableTrade) => { return (Number(t.quantity) * Number(t.price)) + (Number(t.commission)||0) + (Number(t.tax)||0) + (Number(t.cdcCharges)||0) + (Number(t.otherFees)||0); };
  const getTradeProceeds = (t: EditableTrade) => { return (Number(t.quantity) * Number(t.price)) - (Number(t.commission)||0) - (Number(t.tax)||0) - (Number(t.cdcCharges)||0) - (Number(t.otherFees)||0); };
  const money2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Format a money value as a plain 2-decimal string for the scan inputs (0/blank
  // stays blank so zero fees still show a placeholder). Shares are left untouched.
  const dp2 = (v: any): any => { const n = Number(v); return (v === '' || v == null || isNaN(n) || n === 0) ? v : (Math.round(n * 100) / 100).toFixed(2); };
  const fmtPrice = (v: any) => (isFundPortfolio ? dpFundNav(v) : dp2(v));
  const fmtQty = (v: any) => (isFundPortfolio ? dpFundUnits(v) : Number(v).toFixed(2));
  const blurFmt = (idx: number, field: keyof EditableTrade, v: string) => {
      const t = (v || '').trim();
      if (t === '' || isNaN(Number(t))) return;
      if (field === 'quantity') {
          updateSingleScannedTrade(idx, field, fmtQty(t) as any);
      } else if (field === 'price' || field === 'commission' || field === 'tax' || field === 'cdcCharges' || field === 'otherFees') {
          updateSingleScannedTrade(idx, field, fmtPrice(t) as any);
      } else {
          updateSingleScannedTrade(idx, field, Number(t).toFixed(2) as any);
      }
  };
  // A SELL is only valid if a BUY of the same ticker exists on or before its date,
  // either in saved history or among the buys being added in the same batch.
  const hasPriorBuy = (ticker: string, sellDate: string, extraBuys: EditableTrade[] = []) => {
      const norm = (ticker || '').toUpperCase();
      const d = sellDate || '';
      const inExisting = existingTransactions.some(tx => (tx.type === 'BUY' || tx.type === 'TRANSFER_IN') && (tx.ticker || '').toUpperCase() === norm && tx.date <= d);
      const inBatch = extraBuys.some(t => (t.type === 'BUY' || t.type === 'TRANSFER_IN') && (t.ticker || '').toUpperCase() === norm && (t.date || '') <= d);
      return inExisting || inBatch;
  };
  const addSingleTrade = (trade: EditableTrade) => {
      let finalBrokerName = trade.broker;
      if (!isFundPortfolio && trade.brokerId) { const b = brokers.find(br => br.id === trade.brokerId); if (b) finalBrokerName = b.name; }
      const base = {
          date: trade.date || todayPK(),
          broker: isFundPortfolio ? undefined : finalBrokerName,
          brokerId: isFundPortfolio ? undefined : trade.brokerId,
          commission: Number(trade.commission) || 0,
          tax: Number(trade.tax) || 0,
          cdcCharges: Number(trade.cdcCharges) || 0,
          otherFees: Number(trade.otherFees) || 0,
          notes: trade.notes,
      };
      if (trade.type === 'DEPOSIT') {
          onAddTransaction({ ...base, ticker: 'CASH', type: 'DEPOSIT', quantity: 1, price: Number(trade.price) });
          return;
      }
      if (trade.type === 'WITHDRAWAL') {
          onAddTransaction({ ...base, ticker: 'CASH', type: 'WITHDRAWAL', quantity: 1, price: Number(trade.price) });
          return;
      }
      if (trade.type === 'HISTORY') {
          onAddTransaction({ ...base, ticker: 'PREV-PNL', type: 'HISTORY', quantity: 1, price: Number(trade.price) });
          return;
      }
      if (trade.type === 'TAX') {
          onAddTransaction({ ...base, ticker: 'CGT', type: 'TAX', quantity: 1, price: Number(trade.price) });
          return;
      }
      if (trade.type === 'DIVIDEND_REINVEST') {
          onAddTransaction({ ...base, ticker: 'DIV REINVEST', type: 'DIVIDEND_REINVEST', quantity: 1, price: Number(trade.price) });
          return;
      }
      if (trade.type === 'DIVIDEND') {
          onAddTransaction({
              ...base,
              ticker: trade.ticker,
              type: 'DIVIDEND',
              quantity: Number(trade.quantity) || 1,
              price: Number(trade.price),
          });
          return;
      }
      if (trade.type === 'OTHER') {
          onAddTransaction({
              ...base,
              ticker: 'CASH',
              type: 'OTHER',
              quantity: 1,
              price: Number(trade.price),
              category: trade.category || 'ADJUSTMENT',
          });
          return;
      }
      onAddTransaction({
          ...base,
          ticker: trade.ticker,
          type: trade.type as 'BUY' | 'SELL',
          quantity: isFundTicker(trade.ticker) ? roundFundUnits(Number(trade.quantity)) : Number(trade.quantity),
          price: isFundTicker(trade.ticker) ? roundFundNav(Number(trade.price)) : Number(trade.price),
      });
  };
  
  const handleAcceptTrade = (trade: EditableTrade) => { 
      setFormError(null); 
      if (trade.type === 'BUY' && freeCash !== undefined) { 
          const cost = getTradeCost(trade); 
          if (!canAfford(cost, freeCash)) { 
              setFormError(`Insufficient Buying Power! This trade costs Rs. ${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} but you have Rs. ${freeCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`); 
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              return; 
          } 
      } 
      if (trade.type === 'SELL') { 
          const targetBrokerId = trade.brokerId || selectedBrokerId; 
          const currentQty = getHoldingQty(trade.ticker, targetBrokerId); 
          if (!hasPriorBuy(trade.ticker, trade.date || '')) { 
              setFormError(`Cannot add SELL of ${trade.ticker}: no BUY exists on or before ${trade.date || 'that date'}. Add the covering BUY first (same date or earlier), then the SELL.`); 
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); 
              return; 
          } 
          if (Number(trade.quantity) > currentQty) { 
              setFormError(`Insufficient Holdings! You are trying to sell ${trade.quantity} ${trade.ticker}, but you only own ${currentQty}. For a same-day trade, add the BUY before the SELL.`); 
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              return; 
          } 
      } 
      addSingleTrade(trade); 
      updateScannedTrades(savedScannedTrades.filter(t => t !== trade)); 
  };

  const handleAcceptSelected = () => { 
      setFormError(null); 
      const selectedTrades = savedScannedTrades.filter((_, i) => selectedScanIndices.has(i)); 
      
      // Buying power is checked on the NET of the batch (buys minus sell proceeds),
      // so an intraday set that squares off can be added together even when the
      // gross buy cost alone exceeds available cash.
      const totalBuyCost = selectedTrades.reduce((acc, t) => t.type === 'BUY' ? acc + getTradeCost(t) : acc, 0); 
      const totalSellProceeds = selectedTrades.reduce((acc, t) => t.type === 'SELL' ? acc + getTradeProceeds(t) : acc, 0); 
      const totalDepositInBatch = selectedTrades.reduce((acc, t) => t.type === 'DEPOSIT' ? acc + Number(t.price) : acc, 0);
      const netCost = totalBuyCost - totalSellProceeds - totalDepositInBatch; 
      if (freeCash !== undefined && !canAfford(netCost, freeCash)) { 
          setFormError(`Insufficient Buying Power! These trades need Rs. ${money2(netCost)} net but you have Rs. ${money2(freeCash)}.`); 
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); 
          return; 
      } 

      // Every SELL must have a BUY of the same ticker on or before its date
      // (existing history, or a BUY included in this same batch).
      const buysInBatch = selectedTrades.filter(t => t.type === 'BUY' || t.type === 'TRANSFER_IN'); 
      const badSell = selectedTrades.find(t => t.type === 'SELL' && !hasPriorBuy(t.ticker, t.date || '', buysInBatch)); 
      if (badSell) { 
          setFormError(`Cannot add SELL of ${badSell.ticker}: no BUY exists on or before ${badSell.date || 'that date'}. Add the covering BUY first (same date or earlier), then the SELL.`); 
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); 
          return; 
      } 
      
      selectedTrades.forEach(addSingleTrade); 
      updateScannedTrades(savedScannedTrades.filter((_, i) => !selectedScanIndices.has(i))); 
      setSelectedScanIndices(new Set()); 
  };
  
  const updateSingleScannedTrade = (index: number, field: keyof EditableTrade, value: any) => { const updated = [...savedScannedTrades]; updated[index] = { ...updated[index], [field]: value }; updateScannedTrades(updated); };
  const getFileIcon = () => { if (selectedFile) { const isSheet = selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'); if (isSheet) return <FileSpreadsheet size={32} />; return <FileText size={32} />; } if (mode === 'AI_SCAN') return <Sparkles size={32} className="text-indigo-500" />; if (mode === 'IMPORT') return <Upload size={32} className="text-blue-500" />; if (mode === 'EMAIL_IMPORT') return <Mail size={32} className="text-rose-500" />; return <ScanText size={32} className="text-emerald-500" />; };
  const getThemeColor = () => { if (mode === 'AI_SCAN') return { btn: 'bg-indigo-600 hover:bg-indigo-700', text: 'text-indigo-600 dark:text-indigo-400', shadow: 'shadow-indigo-600/20', bg: 'bg-indigo-50/50 dark:bg-indigo-500/10', border: 'border-indigo-300 dark:border-indigo-500/30' }; if (mode === 'IMPORT') return { btn: 'bg-blue-600 hover:bg-blue-700', text: 'text-blue-600 dark:text-blue-400', shadow: 'shadow-blue-600/20', bg: 'bg-blue-50/50 dark:bg-blue-500/10', border: 'border-blue-300 dark:border-blue-500/30' }; return { btn: 'bg-emerald-600 hover:bg-emerald-700', text: 'text-emerald-600 dark:text-emerald-400', shadow: 'shadow-emerald-600/20', bg: 'bg-emerald-50/50 dark:bg-emerald-500/10', border: 'border-emerald-300 dark:border-emerald-500/30' }; };
  const scanTypeBadge = (txType: string) => {
      if (txType === 'BUY') return 'bg-emerald-50 text-emerald-600 border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
      if (txType === 'SELL') return 'bg-blue-50 text-blue-600 border-blue-200/60 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20';
      if (txType === 'DEPOSIT') return 'bg-violet-50 text-violet-600 border-violet-200/60 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20';
      if (txType === 'WITHDRAWAL') return 'bg-rose-50 text-rose-600 border-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20';
      if (txType === 'DIVIDEND' || txType === 'DIVIDEND_REINVEST') return 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
      if (txType === 'TAX') return 'bg-orange-50 text-orange-600 border-orange-200/60 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20';
      if (txType === 'HISTORY') return 'bg-indigo-50 text-indigo-600 border-indigo-200/60 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20';
      return 'bg-slate-50 text-slate-600 border-slate-200/60 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20';
  };

  const theme = getThemeColor();

  const renderFundImportGuide = () => {
    if (!isFundPortfolio || editingTransaction) return null;
    return (
      <div className="mb-5 border border-violet-200/60 dark:border-violet-500/20 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setShowFundGuide(v => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-violet-50/80 dark:bg-violet-500/10 hover:bg-violet-50 dark:hover:bg-violet-500/15 transition-colors text-left"
        >
          <span className="flex items-center gap-2 text-sm font-display font-black text-violet-800 dark:text-violet-200">
            <BookOpen size={16} /> Import existing AMC portfolio
          </span>
          <ChevronDown size={16} className={`text-violet-500 transition-transform ${showFundGuide ? 'rotate-180' : ''}`} />
        </button>
        {showFundGuide && (
          <div className="px-4 py-4 bg-white dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-300 space-y-3 border-t border-violet-100 dark:border-violet-500/10">
            <p className="font-bold text-violet-700 dark:text-violet-300">How far back should you go?</p>
            <div className="space-y-2 leading-relaxed">
              <p>
                <strong>Option A — Best tracking:</strong> enter every Subscribe / Redeem / Dividend you still have records for.
                If the fund is older (e.g. 10 years) but you only have ~2 years of data, start at that 2-year point:
                use the <em>Investment Value then</em> as your <strong>opening balance</strong> (a Subscribe at that date&apos;s units/NAV), then add all later transactions. Don&apos;t invent the missing earlier years.
              </p>
              <p>
                <strong>Option B — Start today:</strong> no old statements? Use <em>today&apos;s Investment Value</em> as starting balance (a Subscribe at current Units/NAV). Profit tracks from today forward.
              </p>
            </div>
            <p className="font-bold text-violet-700 dark:text-violet-300">Opening-balance steps</p>
            <ol className="list-decimal list-inside space-y-2 leading-relaxed">
              <li><strong>Subscribe (Buy)</strong> — one row per fund: <em>Units</em> + <em>NAV</em> on your start date. Leave <strong>Paid directly from bank</strong> ticked and the matching cash deposit is added for you, so you no longer need a separate Deposit row.</li>
              <li><strong>Switching funds?</strong> Untick that box on both the Redeem and the Subscribe — the money then stays as cash inside the portfolio and moves straight from one fund to the other.</li>
              <li><strong>Then</strong> add later Subscribe / Redeem / Dividend rows as you have them.</li>
              <li><strong>History</strong> — only for <em>fully redeemed</em> funds (0 units), e.g. past P&amp;L on MEF. Skip &quot;Gain To Date&quot; on funds you still hold.</li>
            </ol>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
              <p className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><Info size={13} /> After you start</p>
              <p><strong>Unrealized</strong> = paper gain from NAV moves on units you hold.</p>
              <p><strong>Daily income funds</strong> (NAV often flat) — record <strong>Dividend</strong> or <strong>Dividend Reinvest</strong> when income/units grow; that income counts toward return even when NAV stays the same.</p>
              <p><strong>Realized</strong> — use <strong>Redeem</strong> or <strong>History</strong> for closed positions.</p>
            </div>
            <p className="font-bold text-violet-700 dark:text-violet-300">Payout day: three separate rows</p>
            <div className="space-y-2 leading-relaxed">
              <p>
                When a fund distributes, its NAV drops by roughly the payout (e.g. 58.3787 → 51.9209). Your statement usually shows these together, and they are <em>not</em> the same thing:
              </p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li><strong>Dividend</strong> — the gross payout, e.g. 58,897.</li>
                <li><strong>Reinvested in units</strong> — the net after withholding tax, e.g. 44,173 after 25% (14,724), buying units at the post-drop NAV.</li>
                <li><strong>Refund of Capital</strong> — free bonus units restoring the principal the NAV drop took away, e.g. 57,116 as 1,100.0611 units. Untaxed, because it is your own capital coming back.</li>
              </ol>
            </div>
            <div className="bg-amber-50/70 dark:bg-amber-500/10 rounded-xl p-3 border border-amber-200/60 dark:border-amber-500/20 space-y-1.5 text-amber-800 dark:text-amber-300">
              <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> Tax to plan for</p>
              <p>Refund-of-capital units are issued at <strong>zero cost</strong>, so their entire value is taxable gain when you redeem — the tax is deferred, not avoided.</p>
              <p>Dividend withholding is charged on whoever holds units on the announcement date. Investors who move out of an income fund into, say, a money-market fund before the annual announcement and back afterwards receive NAV growth as capital gain instead of a taxed dividend. Rates and treatment differ by fund category and filer status, so confirm with your tax adviser before acting on it.</p>
            </div>
            <p className="text-violet-600 dark:text-violet-400 font-bold flex items-center gap-1.5"><Sparkles size={13} /> Tip: <strong>AI Scan Statement</strong> fills Deposit + Subscribe from your balance screenshot.</p>
          </div>
        )}
      </div>
    );
  };

  // Most Pakistani funds settle dividends as extra units rather than cash, so the
  // two payout shapes sit behind one switch instead of being separate menu entries.
  const renderFundDividendModeSwitch = () => (
    <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl mb-1 shadow-inner gap-1">
      <button
        type="button"
        onClick={() => setType('DIVIDEND_REINVEST')}
        className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${type === 'DIVIDEND_REINVEST' ? 'bg-white dark:bg-slate-700 shadow-sm text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
      >
        <Coins size={14} strokeWidth={3} /> Reinvested in units
      </button>
      <button
        type="button"
        onClick={() => setType('DIVIDEND')}
        className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${type === 'DIVIDEND' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
      >
        <Wallet size={14} strokeWidth={3} /> Paid out in cash
      </button>
    </div>
  );

  const renderFormContent = () => {
    if (type === 'TAX') {
        return (
            <>
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 mb-4 shadow-sm"> <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed"> <strong>Manual CGT Entry:</strong> <br/> • Enter a <strong>positive amount</strong> for tax paid. <br/> • Enter a <strong>negative amount</strong> for tax refund/credit. </p> </div>
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4`}> {!isFundPortfolio && <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm font-bold text-slate-500 dark:text-slate-400 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-4 top-4 text-slate-400" size={14} /></div></div>} <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:color-scheme-dark"/></div> </div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Tax Amount (PKR)</label><input required type="number" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums" placeholder="e.g. 1500 or -500"/></div>
            </>
        );
    }
    
    if (type === 'HISTORY') {
        return (
          <>
              <div className="bg-blue-50/50 dark:bg-blue-500/10 p-4 rounded-2xl border border-blue-200/60 dark:border-blue-500/20 flex gap-3 items-start shadow-sm"><History className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={18} /><div className="text-xs text-blue-700 dark:text-blue-300 font-medium"><p className="font-bold mb-0.5">Record Past Realized Gains</p><p className="opacity-90">{isFundPortfolio ? 'Use for profits/losses from funds you already redeemed (e.g. MEF with 0 units). Do not enter full "Gain To Date" for funds you still hold — that mixes realized + unrealized.' : 'Add realized profits/losses from before using this app.'}</p></div></div>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4`}> {!isFundPortfolio && <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm font-bold text-slate-500 dark:text-slate-400 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-4 top-4 text-slate-400" size={14} /></div></div>} <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Date Recorded</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:color-scheme-dark"/></div> </div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Realized Amount</label><div className="relative"><input required type="number" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className={`w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums ${Number(histAmount) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`} placeholder="-5000 or 10000"/><span className="absolute right-4 top-4 text-xs font-bold text-slate-400">PKR</span></div></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Tax Calculation</label><div className="grid grid-cols-2 gap-3"><label className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border cursor-pointer transition-all font-bold text-xs shadow-sm ${histTaxType === 'AFTER_TAX' ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}`}><input type="radio" name="taxType" checked={histTaxType === 'AFTER_TAX'} onChange={() => setHistTaxType('AFTER_TAX')} className="hidden" /><span>After Tax (Net)</span></label><label className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border cursor-pointer transition-all font-bold text-xs shadow-sm ${histTaxType === 'BEFORE_TAX' ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}`}><input type="radio" name="taxType" checked={histTaxType === 'BEFORE_TAX'} onChange={() => setHistTaxType('BEFORE_TAX')} className="hidden" /><span>Before Tax (Gross)</span></label></div></div>
          </>
        );
    }
    
    if (type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'DIVIDEND_REINVEST') {
        return (
          <>
              <div className="bg-emerald-50/50 dark:bg-emerald-500/10 p-4 rounded-2xl border border-emerald-200/60 dark:border-emerald-500/20 flex gap-3 items-start shadow-sm"><Wallet className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={18} /><div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium"><p className="font-bold mb-0.5">Cash Management</p><p className="opacity-90">{type === 'DIVIDEND_REINVEST' ? (fundUnitReinvest ? 'The dividend is paid out as extra units at that day\u2019s NAV. Enter the units issued and the NAV — the income is counted and the units are added to your holding, with no separate buy needed.' : 'Reinvested dividends count as income and are added to your invested base. Withdrawals draw these down first. Record the buy separately.') : 'Track deposits and withdrawals for accurate principal calculation.'}</p></div></div>
              {fundUnitReinvest && renderFundDividendModeSwitch()}<div className={`${fundUnitReinvest ? 'hidden' : 'flex'} bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl mb-3 shadow-inner gap-1`}><button type="button" onClick={() => setType('DEPOSIT')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${type === 'DEPOSIT' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}> <Plus size={14} strokeWidth={3} /> Add Funds </button><button type="button" onClick={() => setType('WITHDRAWAL')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${type === 'WITHDRAWAL' ? 'bg-white dark:bg-slate-700 shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}> <ArrowRightLeft size={14} strokeWidth={3} /> Withdraw </button><button type="button" onClick={() => setType('DIVIDEND_REINVEST')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${type === 'DIVIDEND_REINVEST' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}> <Coins size={14} strokeWidth={3} /> Reinvest Div </button></div>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4`}> {!isFundPortfolio && <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm font-bold text-slate-500 dark:text-slate-400 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-4 top-4 text-slate-400" size={14} /></div></div>} <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:color-scheme-dark"/></div> </div>
              {fundUnitReinvest ? (
                  <>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Fund</label>
                          <FundPicker
                              catalog={fundCatalog}
                              value={ticker}
                              onChange={(id, fund) => { setTicker(id); setSelectedFund(fund); }}
                          />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Units Issued</label>
                              <input required type="number" step="any" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums" placeholder="0.0000"/>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">NAV</label>
                              <input required type="number" step="any" value={price} onChange={e=>setPrice(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums" placeholder="0.0000"/>
                          </div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Tax / WHT Withheld</label>
                          <input type="number" step="any" value={tax} onChange={e=>setTax(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums" placeholder="0"/>
                          <p className="text-[10px] text-slate-400 mt-1 ml-1 leading-snug">
                              Deducted by the AMC before the units were issued, so it is recorded as dividend tax and is not part of the units&apos; cost.
                          </p>
                      </div>
                      {(() => {
                          const net = (Number(quantity) || 0) * (Number(price) || 0);
                          const t = Number(tax) || 0;
                          const money = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          return (
                              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl px-4 py-3">
                                  <div className="flex flex-col">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Units received</span>
                                      <span className="text-[10px] text-slate-400 tabular-nums">
                                          {(Number(quantity) || 0).toLocaleString()} × {money(Number(price) || 0)}{t > 0 ? ` · gross ${money(net + t)}` : ''}
                                      </span>
                                  </div>
                                  <span className="text-lg font-display font-black tabular-nums text-emerald-600 dark:text-emerald-400">{money(net)}</span>
                              </div>
                          );
                      })()}
                  </>
              ) : (
                  <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Amount</label><div className="relative"><input required type="number" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:text-slate-100 tabular-nums" placeholder="50000"/><span className="absolute right-4 top-4 text-xs font-bold text-slate-400">PKR</span></div></div>
              )}
          </>
        );
    }

    if (type === 'REFUND_OF_CAPITAL') {
        const units = Number(quantity) || 0;
        const nav = Number(price) || 0;
        return (
          <>
              <div className="bg-sky-50/60 dark:bg-sky-500/10 p-4 rounded-2xl border border-sky-200/60 dark:border-sky-500/20 flex gap-3 items-start shadow-sm">
                  <Coins className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" size={18} />
                  <div className="text-xs text-sky-700 dark:text-sky-300 font-medium">
                      <p className="font-bold mb-0.5">Refund of Capital</p>
                      <p className="opacity-90 leading-relaxed">
                          Bonus units the AMC issues to offset the NAV drop that follows a distribution. It returns your own capital, so it is not income and no tax is withheld. The units are free, which means their full value counts as capital gain when you redeem them.
                      </p>
                  </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:color-scheme-dark"/></div>
                  <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Mutual Fund</label>
                      <FundPicker catalog={fundCatalog} value={ticker} onChange={(id, fund) => { setTicker(id); setSelectedFund(fund); }} />
                  </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Bonus Units Issued</label>
                      <input required type="number" step="any" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums" placeholder="0.0000"/>
                  </div>
                  <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">NAV After Drop</label>
                      <input required type="number" step="any" value={price} onChange={e=>setPrice(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums" placeholder="0.0000"/>
                  </div>
              </div>
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl px-4 py-3">
                  <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Capital restored</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">{units.toLocaleString()} units · cost basis Rs. 0.00</span>
                  </div>
                  <span className="text-lg font-display font-black tabular-nums text-sky-600 dark:text-sky-400">
                      Rs. {(units * nav).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
              </div>
          </>
        );
    }

    if (type === 'ANNUAL_FEE') {
        return (
          <>
              <div className="bg-amber-50/50 dark:bg-amber-500/10 p-4 rounded-2xl border border-amber-200/60 dark:border-amber-500/20 flex gap-3 items-start shadow-sm"><CalendarClock className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} /><div className="text-xs text-amber-700 dark:text-amber-300 font-medium"><p className="font-bold mb-0.5">Annual Fee</p><p className="opacity-90">Recurring maintenance fee.</p></div></div>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4`}> {!isFundPortfolio && <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm font-bold text-slate-500 dark:text-slate-400 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-4 top-4 text-slate-400" size={14} /></div></div>} <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:color-scheme-dark"/></div> </div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Fee Amount</label><div className="relative"><input required type="number" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:text-slate-100 tabular-nums" placeholder="e.g. 500"/><span className="absolute right-4 top-4 text-xs font-bold text-slate-400">PKR</span></div></div>
          </>
        );
    }

    if (type === 'OTHER') {
        return (
          <>
              <div className="bg-slate-50/80 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 flex gap-3 items-start shadow-sm"> <Settings2 className="text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" size={18} /> <div className="text-xs text-slate-700 dark:text-slate-300 font-medium"> <p className="font-bold mb-0.5">Other Transactions</p> <p className="opacity-90">Record manual adjustments or miscellaneous fees.</p> </div> </div>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl mb-3 shadow-inner overflow-x-auto no-scrollbar"> 
                  <button type="button" onClick={() => setCategory('ADJUSTMENT')} className={`flex-1 min-w-[80px] py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap px-3 ${category === 'ADJUSTMENT' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}> <ArrowRightLeft size={14} /> Adjustment </button> 
                  <button type="button" onClick={() => setCategory('OTHER_TAX')} className={`flex-1 min-w-[80px] py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap px-3 ${category === 'OTHER_TAX' ? 'bg-white dark:bg-slate-700 shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}> <FileText size={14} /> Other Taxes </button>
                  <button type="button" onClick={() => setCategory('CDC_CHARGE')} className={`flex-1 min-w-[80px] py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap px-3 ${category === 'CDC_CHARGE' ? 'bg-white dark:bg-slate-700 shadow-sm text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}> <FileText size={14} /> Monthly CDC </button>
              </div>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4`}> {!isFundPortfolio && <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm font-bold text-slate-500 dark:text-slate-400 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-4 top-4 text-slate-400" size={14} /></div></div>} <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:color-scheme-dark"/></div> </div>
              <div> <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Amount</label> <div className="relative"> <input required type="number" step="any" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className={`w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums ${category === 'ADJUSTMENT' ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600 dark:text-rose-400'}`} placeholder={category === 'ADJUSTMENT' ? "Positive (Credit) or Negative (Debit)" : category === 'CDC_CHARGE' ? "e.g. 50 (Monthly Charge)" : "e.g. 500 (Deducted from Cash)"} /> <span className="absolute right-4 top-4 text-xs font-bold text-slate-400">PKR</span> </div> {category === 'ADJUSTMENT' ? <p className="text-[10px] font-bold text-slate-400 mt-1.5 ml-1">Positive adds to cash, Negative subtracts from cash.</p> : <p className="text-[10px] font-bold text-slate-400 mt-1.5 ml-1">This amount will be deducted from your cash balance.</p>} </div>
              <div> <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1.5"> <AlignLeft size={14} /> Description (Optional) </label> <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none placeholder-slate-400 shadow-sm" placeholder="e.g. Monthly Savings, Ledger Correction" /> </div>
          </>
        );
    }

    return (
      <>
          {isFundPortfolio && type === 'DIVIDEND' && renderFundDividendModeSwitch()}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> 
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm dark:color-scheme-dark"/></div> 
              {isFundPortfolio ? (
                  <div className="col-span-1">
                      {Object.keys(fundCatalog).length === 0 && onRefreshFundCatalog && (
                          <button
                              type="button"
                              disabled={fundNavLoading}
                              onClick={async () => { setFundNavLoading(true); try { await onRefreshFundCatalog(); } finally { setFundNavLoading(false); } }}
                              className="mb-2 text-[10px] font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1 hover:underline"
                          >
                              {fundNavLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} Refresh fund list
                          </button>
                      )}
                      <FundPicker
                          catalog={fundCatalog}
                          value={ticker}
                          onChange={(id, fund) => { setTicker(id); setSelectedFund(fund); }}
                      />
                  </div>
              ) : (
                  <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Ticker</label><input required type="text" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-display font-black uppercase dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm" placeholder="e.g. OGDC"/></div>
              )}
          </div>
          {!isFundPortfolio && (
          <div className="mb-1"> 
              <div className="flex justify-between items-center mb-1.5 ml-1"> <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Broker</label> {type === 'BUY' && !editingTransaction && freeCash !== undefined && ( <span className={`text-[10px] font-bold tabular-nums ${freeCash >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}> Buying Power: Rs. {freeCash.toLocaleString()} </span> )} </div> 
              <div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm font-bold text-slate-500 dark:text-slate-400 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-4 top-4 text-slate-400" size={16} /></div> 
          </div>
          )}
          {isFundPortfolio && type === 'BUY' && !editingTransaction && freeCash !== undefined && !pairCash && (
              <div className="flex justify-end mb-1">
                  <span className={`text-[10px] font-bold tabular-nums ${freeCash >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                      Available to Invest: Rs. {freeCash.toLocaleString()}
                  </span>
              </div>
          )}
          {isFundPortfolio && (type === 'BUY' || type === 'SELL') && !editingTransaction && (
              <label className="flex items-start gap-3 mb-1 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                  <input
                      type="checkbox"
                      checked={pairCash}
                      onChange={(e) => setPairCash(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-emerald-600 shrink-0"
                  />
                  <span className="text-[11px] leading-snug">
                      <span className="font-bold text-slate-700 dark:text-slate-200 block">
                          {type === 'BUY' ? 'Paid directly from bank' : 'Proceeds withdrawn to bank'}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                          {type === 'BUY'
                              ? `Also records a matching cash deposit${pairAmount > 0 ? ` of Rs. ${pairAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}, so this investment counts towards your principal instead of pushing cash negative.`
                              : `Also records a matching cash withdrawal${pairAmount > 0 ? ` of Rs. ${pairAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}. Untick it when you are switching into another fund and the money stays in the portfolio.`}
                      </span>
                  </span>
              </label>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> 
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{type === 'DIVIDEND' ? (isFundPortfolio ? 'Eligible Units' : 'Eligible Shares') : (isFundPortfolio ? 'Units' : 'Quantity')}</label><input required type="number" step="any" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums" placeholder={isFundPortfolio ? '0.0000' : '0'}/></div> 
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{type === 'DIVIDEND' ? 'Dividend Amount (DPS)' : (isFundPortfolio ? (type === 'BUY' ? 'Offer Price (NAV)' : type === 'SELL' ? 'Repurchase Price (NAV)' : 'NAV') : 'Price')}</label><input required type="number" step="any" value={price} onChange={e=>setPrice(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm tabular-nums" placeholder={isFundPortfolio ? '0.0000' : '0.00'}/></div> 
          </div>
          <div className="pt-2">
              <div className="flex items-center justify-between mb-2 ml-1"><label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{isFundPortfolio ? 'Loads & Fees' : 'Fees & Taxes'}</label>{!isFundPortfolio && <button type="button" onClick={() => setIsAutoCalc(!isAutoCalc)} className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all shadow-sm ${isAutoCalc ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20'}`}> {!isAutoCalc && <AlertTriangle size={12} />} {isAutoCalc ? 'Auto-Calc On' : 'Manual Mode'} </button>}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/80 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                  {!isFundPortfolio && (
                  <>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Commission</label><input type="number" step="any" value={commission} onChange={e=>setCommission(Number(e.target.value))} disabled={type === 'DIVIDEND' && isAutoCalc} className="w-full bg-white dark:bg-slate-900 font-mono text-xs p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 disabled:bg-slate-100 dark:disabled:bg-slate-800 dark:text-slate-200 tabular-nums shadow-sm outline-none"/></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Tax / WHT</label><input type="number" step="any" value={tax} onChange={e=>setTax(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 font-mono text-xs p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 dark:text-slate-200 tabular-nums shadow-sm outline-none"/></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">CDC Charges</label><input type="number" step="any" value={cdcCharges} onChange={e=>setCdcCharges(Number(e.target.value))} disabled={type === 'DIVIDEND' && isAutoCalc} className="w-full bg-white dark:bg-slate-900 font-mono text-xs p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 disabled:bg-slate-100 dark:disabled:bg-slate-800 dark:text-slate-200 tabular-nums shadow-sm outline-none"/></div>
                  </>
                  )}
                  {isFundPortfolio && (
                  <>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Sales Load / Fees</label><input type="number" step="any" value={otherFees} onChange={e=>setOtherFees(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 font-mono text-xs p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 dark:text-slate-200 tabular-nums shadow-sm outline-none" placeholder="0"/></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Tax / WHT</label><input type="number" step="any" value={tax} onChange={e=>setTax(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 font-mono text-xs p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 dark:text-slate-200 tabular-nums shadow-sm outline-none"/></div>
                  </>
                  )}
                  {!isFundPortfolio && (
                  <div> 
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1"> 
                          {type === 'DIVIDEND' ? 'Zakat' : 'Other Fees'} 
                      </label> 
                      <input type="number" step="any" value={otherFees} onChange={e=>setOtherFees(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 font-mono text-xs p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 dark:text-slate-200 tabular-nums shadow-sm outline-none" /> 
                  </div>
                  )}
              </div>
          </div>
      </>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-end sm:items-start justify-center p-0 sm:p-4 sm:pt-12 md:pt-20 overflow-y-auto transition-opacity safe-area-pad">
      <div className={`bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-t-3xl sm:rounded-3xl shadow-card dark:shadow-card-dark w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 pb-[env(safe-area-inset-bottom)] ${savedScannedTrades.length > 0 ? 'max-w-6xl' : 'max-w-md md:max-w-2xl'}`}>
        
        <div className="relative flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20 rounded-t-3xl shrink-0">
          <div className="sm:hidden w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 absolute left-1/2 -translate-x-1/2 top-2" aria-hidden />
          <h2 className="text-lg sm:text-xl font-display font-black text-slate-900 dark:text-white tracking-tight">
             {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-full transition-colors" aria-label="Close"><X size={20} /></button>
        </div>

        {!editingTransaction && (
            <div className="px-6 pt-6 shrink-0">
                <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-inner mb-6 overflow-x-auto no-scrollbar">
                    <button onClick={() => setMode('MANUAL')} className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${mode === 'MANUAL' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}> <Keyboard size={16} /> Manual </button>
                    {!isFundPortfolio && (
                    <>
                    <button onClick={() => setMode('IMPORT')} className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${mode === 'IMPORT' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}> <FileSpreadsheet size={16} /> Import </button>
                    <button onClick={() => setMode('EMAIL_IMPORT')} className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${mode === 'EMAIL_IMPORT' ? 'bg-white dark:bg-slate-700 shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}> <Mail size={16} /> Email </button>
                    <button onClick={() => setMode('OCR_SCAN')} className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${mode === 'OCR_SCAN' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}> <ScanText size={16} /> OCR </button>
                    </>
                    )}
                    <button onClick={() => setMode('AI_SCAN')} className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${mode === 'AI_SCAN' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}> <Sparkles size={16} /> {isFundPortfolio ? 'AI Scan Statement' : 'AI Scan'} </button>
                </div>
            </div>
        )}

        <div ref={scrollContainerRef} className="p-6 pt-0 flex-1 overflow-y-auto custom-scrollbar scroll-smooth">
            {formError && ( <div className="bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in slide-in-from-top-2 mb-5 shadow-sm"> <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={18} /> <div> <h4 className="font-display font-black text-rose-800 dark:text-rose-200 text-sm">Action Blocked</h4> <p className="text-xs font-medium text-rose-600 dark:text-rose-300 mt-1">{formError}</p> </div> </div> )}

            {mode === 'MANUAL' && (
                <form onSubmit={handleManualSubmit} className="space-y-5">

                    {renderFundImportGuide()}
                    
                    <div className="mb-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Transaction Type</label>
                        <div className="relative">
                            <select
                                value={type === 'WITHDRAWAL' || type === 'DIVIDEND_REINVEST' ? 'DEPOSIT' : type}
                                onChange={(e) => setType(e.target.value as any)}
                                className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none shadow-sm transition-all"
                            >
                                <option value="BUY">{isFundPortfolio ? 'Subscribe (Buy Units)' : 'Buy'}</option>
                                <option value="SELL">{isFundPortfolio ? 'Redeem (Sell Units)' : 'Sell'}</option>
                                <option value="DIVIDEND">Dividend (DIV)</option>
                                {isFundPortfolio && <option value="REFUND_OF_CAPITAL">Refund of Capital (Bonus Units)</option>}
                                {!isFundPortfolio && <option value="TAX">Tax (CGT)</option>}
                                <option value="HISTORY">{isFundPortfolio ? 'History (Past Realized)' : 'History'}</option>
                                <option value="DEPOSIT">Cash (Deposit / Withdrawal)</option>
                                <option value="ANNUAL_FEE">Annual Fee</option>
                                <option value="OTHER">Other</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-4 text-slate-400 pointer-events-none" size={16} />
                        </div>
                    </div>

                    {renderFormContent()}

                    {/* Live total incl. fees — for Buy / Sell / Dividend */}
                    {(type === 'BUY' || type === 'SELL' || type === 'DIVIDEND') && Number(quantity) > 0 && Number(price) > 0 && (() => {
                        const q = Number(quantity) || 0;
                        const p = Number(price) || 0;
                        const gross = q * p;
                        const feeSum = (Number(commission) || 0) + (Number(tax) || 0) + (Number(cdcCharges) || 0) + (Number(otherFees) || 0);
                        const total = type === 'BUY' ? gross + feeSum : type === 'SELL' ? gross - feeSum : gross - (Number(tax) || 0) - (Number(otherFees) || 0);
                        const label = type === 'BUY' ? 'Total cost (incl. fees)' : type === 'SELL' ? 'Net proceeds (after fees)' : 'Net dividend (after tax)';
                        const money = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        return (
                            <div className="mt-4 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl px-4 py-3">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
                                    <span className="text-[10px] text-slate-400 tabular-nums">{q.toLocaleString()} × {money(p)}{feeSum > 0 ? ` ${type === 'SELL' ? '−' : type === 'DIVIDEND' ? '−' : '+'} ${money(type === 'DIVIDEND' ? (Number(tax) || 0) + (Number(otherFees) || 0) : feeSum)} fees` : ''}</span>
                                </div>
                                <span className={`text-lg font-display font-black tabular-nums ${type === 'BUY' ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(total)}</span>
                            </div>
                        );
                    })()}

                    <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 mt-6 text-sm">
                        <Save size={18} /> Save Transaction
                    </button>
                </form>
            )}

            {(mode !== 'MANUAL') && (
                <div className="flex flex-col min-h-[360px] relative">
                    
                    {mode === 'EMAIL_IMPORT' && (
                        <div className="space-y-5">
                            <div className="bg-rose-50/50 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 rounded-2xl p-5 shadow-sm">
                                <h4 className="text-sm font-display font-black text-rose-900 dark:text-rose-200 flex items-center gap-2.5 mb-3">
                                    <Mail size={18} /> Search Inbox
                                </h4>
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1.5 ml-1">Sender (Optional)</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. alerts@scstrade.com" 
                                            value={emailSender}
                                            onChange={e => setEmailSender(e.target.value)}
                                            className="w-full text-xs p-3 rounded-xl border border-rose-200/80 dark:border-rose-700/60 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:border-rose-400 outline-none shadow-sm transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1.5 ml-1">Subject Keyword</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Confirmation" 
                                            value={emailQuery}
                                            onChange={e => setEmailQuery(e.target.value)}
                                            className="w-full text-xs p-3 rounded-xl border border-rose-200/80 dark:border-rose-700/60 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:border-rose-400 outline-none shadow-sm transition-all"
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleEmailSearch()} 
                                    disabled={loadingEmails}
                                    className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-600/20"
                                >
                                    {loadingEmails ? <Loader2 className="animate-spin" size={16} /> : <SearchIcon size={16} />}
                                    Find Emails with Attachments
                                </button>
                            </div>

                            <div className="space-y-3">
                                {emailMessages.length > 0 && (
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Recent Matches</p>
                                )}
                                
                                {emailMessages.map(msg => (
                                    <div key={msg.id} className="border border-slate-200/60 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900/50 shadow-sm transition-all">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h5 className="font-display font-black text-slate-900 dark:text-white text-sm line-clamp-1">{msg.subject}</h5>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{msg.from} • {new Date(msg.date).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            {msg.attachments.map((att: any) => (
                                                <button 
                                                    key={att.id}
                                                    onClick={() => handleSelectAttachment(msg.id, att)}
                                                    disabled={downloadingAttachment}
                                                    className="w-full flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/10 p-3 rounded-xl group transition-all text-left shadow-sm"
                                                >
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <Paperclip size={16} className="text-slate-400 group-hover:text-emerald-500 shrink-0" />
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 truncate">
                                                            {att.filename}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                                            ({Math.round(att.size / 1024)} KB)
                                                        </span>
                                                    </div>
                                                    <div className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {downloadingAttachment ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                
                                {!loadingEmails && emailMessages.length === 0 && (emailQuery || emailSender) && !scanError && (
                                    <div className="text-center py-10 text-slate-400 font-medium text-xs">
                                        No matching emails found. Try broadening your search.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!isScanning && savedScannedTrades.length === 0 && mode !== 'EMAIL_IMPORT' && (
                        <>
                             {isFundPortfolio && mode === 'AI_SCAN' && (
                                 <div className="mb-4 space-y-3">
                                     <div className="bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-500/20 rounded-2xl p-4 text-xs text-indigo-800 dark:text-indigo-200">
                                         <p className="font-bold mb-1 flex items-center gap-1.5"><Sparkles size={14} /> AMC / bank statement scan</p>
                                         <p>Upload a <strong>balance summary</strong> (Units, NAV, Investment Value) or an <strong>activity statement</strong> (cash, subscribe, redeem, dividends, tax). AI can extract both.</p>
                                     </div>
                                     <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-4 shadow-sm">
                                         <button
                                             type="button"
                                             onClick={() => setShowFundScanHelp(v => !v)}
                                             className="w-full flex items-center justify-between gap-2 text-left"
                                         >
                                             <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                                 <Info size={13} /> How should AI read this file?
                                             </span>
                                             <ChevronDown size={14} className={`text-slate-400 transition-transform ${showFundScanHelp ? 'rotate-180' : ''}`} />
                                         </button>
                                         {showFundScanHelp && (
                                             <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                                 Different AMCs/banks use different column names. Tell the AI what to look for — e.g. &quot;Al Meezan: Investment Value is market value; ignore Avg Cost&quot;,
                                                 &quot;Cash In = Deposit, Purchase = Subscribe, Dividend Reinvested = DIVIDEND_REINVEST&quot;, &quot;WHT column is TAX&quot;.
                                                 Tips are saved on this device for next scan.
                                             </p>
                                         )}
                                         <textarea
                                             value={fundScanInstructions}
                                             onChange={(e) => setFundScanInstructions(e.target.value)}
                                             rows={4}
                                             placeholder={`Examples:\n• Al Meezan balance: columns are Fund | Units | NAV | Investment Value | Gain To Date\n• Activity: Credit = Deposit, Debit purchase = Subscribe, WHT = TAX\n• Daily income funds: reinvested dividends increase units — map as DIVIDEND_REINVEST + Subscribe if both shown`}
                                             className="mt-3 w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-y min-h-[88px]"
                                         />
                                     </div>
                                 </div>
                             )}
                             <div onClick={() => fileInputRef.current?.click()} className={`w-full flex-1 border-2 border-dashed ${selectedFile ? `${theme.border} ${theme.bg}` : `border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30`} rounded-3xl cursor-pointer hover:bg-white dark:hover:bg-slate-800/50 transition-all group flex flex-col items-center justify-center p-10`}> 
                                 <input ref={fileInputRef} type="file" accept={mode === 'OCR_SCAN' ? "image/*,.pdf" : "image/*,.pdf,.csv,.xlsx,.xls"} onChange={handleFileSelect} className="hidden" />
                                 <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 shadow-sm border border-slate-200/60 dark:border-slate-700 ${selectedFile ? `${theme.text} bg-white dark:bg-slate-900` : 'bg-white dark:bg-slate-900 text-slate-400'}`}> {getFileIcon()} </div>
                                 <h3 className="text-lg font-display font-black text-slate-900 dark:text-white mb-1 tracking-tight">{selectedFile ? selectedFile.name : 'Click to Upload'}</h3>
                                 <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest text-center max-w-[280px]">
                                     {selectedFile 
                                         ? `${(selectedFile.size / 1024).toFixed(1)} KB - Ready` 
                                         : mode === 'IMPORT' ? 'Upload Excel/CSV Template' : mode === 'AI_SCAN' && isFundPortfolio ? 'AMC balance summary — screenshot, PDF or Excel' : mode === 'AI_SCAN' ? 'Screenshot, PDF, Excel or CSV (Gemini AI)' : 'Standard Image OCR'
                                     }
                                 </p>
                             </div>
                             
                             {mode === 'IMPORT' && !selectedFile && !scanError && ( <button onClick={handleDownloadTemplate} className="mt-4 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline mx-auto opacity-80 hover:opacity-100 transition-opacity" > <Download size={14} /> Download Import Template (CSV) </button> )}
                            
                             {scanError && ( <div className={`w-full flex-1 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 ${scanError.includes("No trades found") ? "border-amber-200 bg-amber-50/50 dark:bg-amber-500/10 dark:border-amber-500/20" : "border-rose-200 bg-rose-50/50 dark:bg-rose-500/10 dark:border-rose-500/20"}`}> <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm border ${scanError.includes("No trades found") ? "bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400" : "bg-rose-100 text-rose-500 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400"}`}> {scanError.includes("No trades found") ? <Search size={32} /> : <AlertTriangle size={32} />} </div> <h3 className={`text-lg font-display font-black mb-1 tracking-tight ${scanError.includes("No trades found") ? "text-amber-900 dark:text-amber-200" : "text-rose-900 dark:text-rose-200"}`}>{scanError.includes("No trades found") ? "No Results Found" : "Scan Failed"}</h3> <p className={`text-xs font-bold text-center max-w-[240px] mb-6 ${scanError.includes("No trades found") ? "text-amber-700 dark:text-amber-300" : "text-rose-600 dark:text-rose-300"}`}>{scanError}</p> <button onClick={() => { setScanError(null); setSelectedFile(null); }} className={`px-6 py-3 bg-white dark:bg-slate-800 border rounded-xl font-bold text-xs shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 ${scanError.includes("No trades found") ? "border-amber-200 text-amber-600 dark:border-amber-700 dark:text-amber-400" : "border-rose-200 text-rose-600 dark:border-rose-700 dark:text-rose-400"}`}> <RefreshCcw size={14} /> Try Different File </button> </div> )}
                            
                             {!scanError && ( <button onClick={handleProcessScan} disabled={!selectedFile} className={`w-full mt-6 py-3.5 rounded-xl font-bold text-white shadow-md transition-all flex items-center justify-center gap-2 text-sm ${selectedFile ? `${theme.btn} ${theme.shadow} hover:-translate-y-0.5 active:translate-y-0 cursor-pointer` : 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-600 cursor-not-allowed shadow-none'}`}> {mode === 'AI_SCAN' ? <Sparkles size={18} /> : mode === 'IMPORT' ? <Upload size={18} /> : <ScanText size={18} />} {mode === 'AI_SCAN' ? 'Analyze with AI' : mode === 'IMPORT' ? 'Process Import' : 'Extract Text'} </button> )}
                        </>
                    )}

                    {isScanning && ( <div className="flex flex-col items-center justify-center h-full py-20"> <Loader2 size={48} className={`animate-spin mb-6 ${theme.text}`} /> <h3 className="text-lg font-display font-black text-slate-900 dark:text-white mb-2 tracking-tight">Processing Document</h3> <p className="text-slate-400 text-xs font-bold uppercase tracking-widest text-center">Reading file data, please wait...</p> </div> )}
                    
                    {savedScannedTrades.length > 0 && (
                        <div className="w-full flex-1 flex flex-col overflow-hidden animate-in fade-in">
                            {fundScanHint && (
                                <div className="mb-4 bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-2xl p-4 text-xs text-amber-800 dark:text-amber-200 flex gap-2">
                                    <Info size={16} className="shrink-0 mt-0.5" />
                                    <p>{fundScanHint}</p>
                                </div>
                            )}
                            <div className="flex justify-between items-center mb-4 px-1">
                                <h3 className="font-display font-black text-slate-900 dark:text-white text-xl tracking-tight">Found {savedScannedTrades.length} {isFundPortfolio ? 'Rows' : 'Trades'}</h3>
                                <div className="flex items-center gap-2">
                                    {!isFundPortfolio && (
                                    <button 
                                        onClick={handleAutoFillFees}
                                        className="text-xs bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 border border-indigo-200/80 dark:border-indigo-500/30 font-bold px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm"
                                        title="Recalculate fees based on your broker settings"
                                    >
                                        <Calculator size={16} /> Auto-Fill Fees
                                    </button>
                                    )}

                                    {selectedScanIndices.size > 0 && ( <button onClick={handleAcceptSelected} className="text-xs bg-emerald-600 text-white hover:bg-emerald-700 font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"> <Plus size={16} /> Add Selected ({selectedScanIndices.size}) </button> )}
                                    <button onClick={() => { updateScannedTrades([]); setSelectedFile(null); setSelectedScanIndices(new Set()); }} className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1.5 px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"> <RefreshCcw size={14} /> Clear All </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mb-4"> 
                                <div className="bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-center items-center shadow-sm"> 
                                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-widest mb-1">Total Buy Cost</span> 
                                    <div className="text-sm font-mono font-bold text-emerald-800 dark:text-emerald-200 tabular-nums">Rs. {scanTotals.totalBuy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div> 
                                </div> 
                                <div className="bg-blue-50/80 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20 rounded-2xl p-4 flex flex-col justify-center items-center shadow-sm"> 
                                    <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-widest mb-1">Total Sell Proceeds</span> 
                                    <div className="text-sm font-mono font-bold text-blue-800 dark:text-blue-200 tabular-nums">Rs. {scanTotals.totalSell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div> 
                                </div> 
                                <div className={`border rounded-2xl p-4 flex flex-col justify-center items-center shadow-sm ${scanTotals.net >= 0 ? 'bg-indigo-50/80 dark:bg-indigo-500/10 border-indigo-200/60 dark:border-indigo-500/20' : 'bg-rose-50/80 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/20'}`}> 
                                    <span className={`text-[10px] uppercase font-bold tracking-widest mb-1 ${scanTotals.net >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}`}>Net Flow (In/Out)</span> 
                                    <div className={`text-sm font-mono font-bold tabular-nums ${scanTotals.net >= 0 ? 'text-indigo-800 dark:text-indigo-200' : 'text-rose-800 dark:text-rose-200'}`}> {scanTotals.net >= 0 ? '+' : ''}Rs. {scanTotals.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} </div> 
                                </div> 
                            </div>

                            <div className="flex-1 overflow-auto border border-slate-200/60 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-card dark:shadow-card-dark custom-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[1000px] whitespace-nowrap">
                                    <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-widest border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10"> 
                                        <tr> 
                                            <th className="px-4 py-3.5 text-center w-12"> <input type="checkbox" onChange={toggleSelectAll} checked={selectedScanIndices.size === savedScannedTrades.length && savedScannedTrades.length > 0} className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"/> </th> 
                                            <th className="px-4 py-3.5">Type</th> 
                                            <th className="px-4 py-3.5">Date</th> 
                                            <th className="px-4 py-3.5">{isFundPortfolio ? 'Fund' : 'Ticker'}</th> 
                                            {!isFundPortfolio && <th className="px-4 py-3.5">Broker</th>} 
                                            <th className="px-4 py-3.5 w-28 text-right">{isFundPortfolio ? 'Units' : 'Qty'}</th> 
                                            <th className="px-4 py-3.5 w-28 text-right">{isFundPortfolio ? 'NAV' : 'Price'}</th> 
                                            {!isFundPortfolio && <th className="px-3 py-3.5 w-20 text-right opacity-70">Comm</th>} 
                                            <th className="px-3 py-3.5 w-20 text-right opacity-70">Tax</th> 
                                            {!isFundPortfolio && <th className="px-3 py-3.5 w-20 text-right opacity-70">CDC</th>} 
                                            <th className="px-3 py-3.5 w-20 text-right opacity-70">{isFundPortfolio ? 'Load/Fees' : 'Other/Zakat'}</th> 
                                            <th className="px-4 py-3.5 text-center">Action</th> 
                                        </tr> 
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                      {savedScannedTrades.map((t, idx) => (
                                        <tr key={idx} className={`even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors group ${selectedScanIndices.has(idx) ? 'bg-indigo-50/40 dark:bg-indigo-500/10' : ''}`}>
                                          <td className="px-4 py-3 text-center">
                                            <input type="checkbox" checked={selectedScanIndices.has(idx)} onChange={() => toggleScanSelection(idx)} className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"/>
                                          </td>
                                          <td className="px-4 py-3"><span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border shadow-sm ${scanTypeBadge(t.type)}`}>{t.type}</span></td>
                                          <td className="px-4 py-3"><input type="date" value={t.date || ''} onChange={(e) => updateSingleScannedTrade(idx, 'date', e.target.value)} className="w-28 bg-transparent text-xs font-mono font-medium text-slate-700 dark:text-slate-300 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-all p-1" /></td>
                                          <td className="px-4 py-3">
                                            {isFundPortfolio && isFundTicker(t.ticker) ? (
                                              <span className="text-xs font-display font-black text-slate-900 dark:text-white block max-w-[200px] truncate" title={scanFundLabel(t)}>{scanFundLabel(t)}</span>
                                            ) : (
                                              <input type="text" value={t.ticker} onChange={(e) => updateSingleScannedTrade(idx, 'ticker', e.target.value.toUpperCase())} className="w-20 uppercase bg-transparent text-xs font-display font-black text-slate-900 dark:text-white outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-all p-1" title={t.notes} />
                                            )}
                                          </td>
                                          {!isFundPortfolio && (
                                            <td className="px-4 py-3"><select disabled value={t.brokerId || ''} className="w-28 bg-transparent text-xs font-bold text-slate-500 dark:text-slate-400 outline-none border-b border-transparent appearance-none truncate cursor-not-allowed bg-slate-100 dark:bg-slate-800 p-1"><option value="">{t.broker || 'Select'}</option>{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
                                          )}
                                          <td className="px-4 py-3 text-right"><input type="number" step="any" value={t.quantity} onChange={(e) => updateSingleScannedTrade(idx, 'quantity', Number(e.target.value))} onBlur={(e) => blurFmt(idx, 'quantity', e.target.value)} className="w-full bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-slate-100 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-all text-right tabular-nums p-1" placeholder={isFundPortfolio ? '0.0000' : '0'} /></td>
                                          <td className="px-4 py-3 text-right"><input type="text" inputMode="decimal" value={t.price} onChange={(e) => updateSingleScannedTrade(idx, 'price', e.target.value)} onBlur={(e) => blurFmt(idx, 'price', e.target.value)} className="w-full bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-slate-100 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-all text-right tabular-nums p-1" placeholder={isFundPortfolio ? '0.0000' : '0.00'} /></td>
                                          {!isFundPortfolio && (
                                            <td className="px-3 py-3 text-right"><input type="text" inputMode="decimal" value={t.commission || ''} onChange={(e) => updateSingleScannedTrade(idx, 'commission', e.target.value)} onBlur={(e) => blurFmt(idx, 'commission', e.target.value)} className="w-full bg-transparent text-xs font-mono text-rose-500 dark:text-rose-400 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 placeholder-slate-300 text-right tabular-nums p-1" placeholder="0" disabled={t.type === 'DEPOSIT' || t.type === 'HISTORY'} /></td>
                                          )}
                                          <td className="px-3 py-3 text-right"><input type="text" inputMode="decimal" value={t.tax || ''} onChange={(e) => updateSingleScannedTrade(idx, 'tax', e.target.value)} onBlur={(e) => blurFmt(idx, 'tax', e.target.value)} className="w-full bg-transparent text-xs font-mono text-rose-500 dark:text-rose-400 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 placeholder-slate-300 text-right tabular-nums p-1" placeholder="0" disabled={t.type === 'DEPOSIT' || t.type === 'HISTORY'} /></td>
                                          {!isFundPortfolio && (
                                            <td className="px-3 py-3 text-right"><input type="text" inputMode="decimal" value={t.cdcCharges || ''} onChange={(e) => updateSingleScannedTrade(idx, 'cdcCharges', e.target.value)} onBlur={(e) => blurFmt(idx, 'cdcCharges', e.target.value)} className="w-full bg-transparent text-xs font-mono text-rose-500 dark:text-rose-400 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 placeholder-slate-300 text-right tabular-nums p-1" placeholder="0" disabled={t.type === 'DEPOSIT' || t.type === 'HISTORY'} /></td>
                                          )}
                                          <td className="px-3 py-3 text-right"><input type="text" inputMode="decimal" value={t.otherFees || ''} onChange={(e) => updateSingleScannedTrade(idx, 'otherFees', e.target.value)} onBlur={(e) => blurFmt(idx, 'otherFees', e.target.value)} className="w-full bg-transparent text-xs font-mono text-rose-500 dark:text-rose-400 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 placeholder-slate-300 text-right tabular-nums p-1" placeholder="0" disabled={t.type === 'DEPOSIT' || t.type === 'HISTORY'} /></td>
                                          <td className="px-4 py-3 text-center"><button onClick={() => handleAcceptTrade(t)} className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm border border-indigo-200/60 dark:border-indigo-500/20" title="Add Transaction"> <Plus size={16} strokeWidth={3} /> </button></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};