"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";

const UNITS = ["Casa Grande", "Casa Piccola", "Villa Intera"];
const CHANNELS = ["Privato", "Airbnb", "Booking.com", "Expedia", "Altro"];
const STATUSES = ["Confermata", "Opzionata", "Cancellata"];
const PAY_ST = ["Pagato", "In attesa", "Parziale", "Rimborsato"];
const MI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DOW = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
const COST_CATS = ["Pulizie","Lavanderia","Utilities","Manutenzione","Giardinaggio","Piscina","Consumabili","Commissioni Portali","Marketing","Assicurazione","Tasse","Altro"];
const PAY_METHODS = ["Contanti","Bonifico","Carta","PayPal","Altro"];

const SC = {
  Confermata:{bg:"rgba(45,122,79,0.85)",br:"#3DA66A",tx:"#E8F5E9"},
  Opzionata:{bg:"rgba(212,168,67,0.85)",br:"#E5BA4B",tx:"#FFF8E1"},
  Cancellata:{bg:"rgba(139,58,58,0.6)",br:"#A84444",tx:"#FFCDD2"},
};
const UC = {"Casa Grande":"#3B7DD8","Casa Piccola":"#D4764E","Villa Intera":"#9B59B6"};
const CI2 = {Privato:"👤",Airbnb:"🏠","Booking.com":"🅱️",Expedia:"✈️",Altro:"📋"};
const CR = {Privato:0,Airbnb:0.03,"Booking.com":0.15,Expedia:0.15,Altro:0.10};
const DC = {"Casa Grande":80,"Casa Piccola":50,"Villa Intera":120};
const CEDOLARE_PCT = 0.21;
const TOURIST_TAX_RATE = 2;
const ENTRY_TYPES = ["Costo","Altro Ricavo"];

// Calcola il riepilogo finanziario di una prenotazione.
// Commissione € e Cedolare € sono INPUT MANUALI; le % sono calcolate automaticamente per riferimento.
function calcNet(b){
  const gross = Number(b.grossPrice)||0;
  const cleaning = Number(b.cleaningFee)||0;
  const extra = Number(b.extraFee)||0;
  const discount = Number(b.discount)||0;
  const touristTax = Number(b.touristTax)||0;
  const commEur = Number(b.commissionEur)||0;
  const cedolareEur = Number(b.cedolareEur)||0;
  const taxableBase = gross+extra-discount;
  const commPct = gross>0 ? commEur/gross : 0;
  const cedolarePct = taxableBase>0 ? cedolareEur/taxableBase : 0;
  const net = gross+cleaning+extra-discount+touristTax-commEur-cedolareEur;
  return {gross,cleaning,extra,discount,touristTax,commEur,commPct,cedolareEur,cedolarePct,net};
}

function dim(y,m){return new Date(y,m+1,0).getDate();}
function pD(s){if(!s)return null;const d=new Date(s+"T00:00:00");return isNaN(d)?null:d;}
function toI(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function fI(s){const d=pD(s);if(!d)return"";return`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;}
function nC(a,b){const d1=pD(a),d2=pD(b);if(!d1||!d2)return 0;return Math.round((d2-d1)/864e5);}

const EMPTY_BK = {id:"",property_id:"",check_in:"",check_out:"",unit:"Casa Grande",channel:"Airbnb",guest_name:"",guests_count:2,gross_price:0,cleaning_fee:80,extra_fee:0,discount:0,touristTax:0,commissionEur:0,cedolareEur:0,status:"Confermata",payment_status:"In attesa",notes:"",booking_date:""};
const EMPTY_CO = {id:"",date:"",category:"Pulizie",subcategory:"",supplier:"",unit:"Generale",amount:0,vat_pct:0,recurrence:"Una Tantum",payment_method:"Bonifico",notes:"",entryType:"Costo"};

const IS={display:"block",width:"100%",padding:"10px",marginTop:3,background:"rgba(15,26,46,0.8)",border:"1px solid rgba(201,169,110,0.15)",borderRadius:6,color:"#E8E0D0",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
const LS={fontSize:10,color:"#777",letterSpacing:0.5,display:"block"};

export default function AdminApp(){
  const today=new Date();
  const [yr,setYr]=useState(today.getFullYear());
  const [mo,setMo]=useState(today.getMonth());
  const [properties,setProperties]=useState([]);
  const [bk,setBk]=useState([]);
  const [co,setCo]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("cal");
  const [showBkForm,setShowBkForm]=useState(false);
  const [showCoForm,setShowCoForm]=useState(false);
  const [editBkId,setEditBkId]=useState(null);
  const [editCoId,setEditCoId]=useState(null);
  const [bkForm,setBkForm]=useState({...EMPTY_BK});
  const [coForm,setCoForm]=useState({...EMPTY_CO});
  const [selId,setSelId]=useState(null);
  const [selDay,setSelDay]=useState(null);
  const [search,setSearch]=useState("");
  const [fUnit,setFUnit]=useState("Tutte");
  const [fStat,setFStat]=useState("Tutte");
  const [coSearch,setCoSearch]=useState("");
  const [coFCat,setCoFCat]=useState("Tutte");
  const [msg,setMsg]=useState("");
  const tlRef=useRef(null);

  const unitNameToId = (name) => properties.find(p=>p.name===name)?.id;
  const unitIdToName = (id) => properties.find(p=>p.id===id)?.name || "Casa Grande";

  // Load from Supabase
  const loadAll = useCallback(async () => {
    const { data: props } = await supabase.from("properties").select("*").order("beds");
    setProperties(props || []);
    const { data: bookings } = await supabase.from("bookings").select("*").order("check_in");
    setBk((bookings||[]).map(b=>({
      ...b, unit: (props||[]).find(p=>p.id===b.property_id)?.name || "Casa Grande",
      guestName:b.guest_name, checkIn:b.check_in, checkOut:b.check_out, guests:b.guests_count,
      grossPrice:Number(b.gross_price), cleaningFee:Number(b.cleaning_fee), extraFee:Number(b.extra_fee),
      discount:Number(b.discount), touristTax:Number(b.tourist_tax||0), commissionEur:Number(b.commission_eur||0), cedolareEur:Number(b.cedolare_eur||0), paymentStatus:b.payment_status, bookingDate:b.booking_date
    })));
    const { data: costs } = await supabase.from("costs").select("*").order("date",{ascending:false});
    setCo((costs||[]).map(c=>({
      ...c, vatPct:Number(c.vat_pct), amount:Number(c.amount), payMethod:c.payment_method, entryType:c.entry_type||"Costo"
    })));
    setLoading(false);
  }, []);

  useEffect(()=>{ loadAll(); }, [loadAll]);

  useEffect(()=>{
    if(!loading && tlRef.current){
      const sd=today.getDate()-1;
      tlRef.current.scrollLeft=Math.max(0,sd*44-80);
    }
  },[loading,mo,yr]);

  const days=dim(yr,mo);
  const todayStr=toI(today);
  const prevMo=()=>{if(mo===0){setMo(11);setYr(y=>y-1);}else setMo(m=>m-1);setSelDay(null);};
  const nextMo=()=>{if(mo===11){setMo(0);setYr(y=>y+1);}else setMo(m=>m+1);setSelDay(null);};
  const goToday=()=>{setMo(today.getMonth());setYr(today.getFullYear());setSelDay(today.getDate());};

  const unitsOnDay=(day)=>{
    const ds=new Date(yr,mo,day);
    const occupied=[];
    bk.forEach(b=>{
      if(b.status==="Cancellata")return;
      const ci=pD(b.checkIn),co2=pD(b.checkOut);
      if(!ci||!co2)return;
      if(ds>=ci&&ds<co2){
        if(!occupied.find(x=>x.unit===b.unit))occupied.push({unit:b.unit,status:b.status,guest:b.guestName});
      }
    });
    return occupied;
  };

  const bookingsOnDay=(day)=>{
    const ds=new Date(yr,mo,day);
    return bk.filter(b=>{
      const ci=pD(b.checkIn),co2=pD(b.checkOut);
      if(!ci||!co2)return false;
      return ds>=ci&&ds<co2;
    });
  };

  const monthBk=bk.filter(b=>{
    const ci=pD(b.checkIn),co2=pD(b.checkOut);
    if(!ci||!co2)return false;
    const ms=new Date(yr,mo,1),me=new Date(yr,mo+1,0);
    return ci<=me&&co2>ms;
  }).sort((a,b)=>a.checkIn>b.checkIn?1:-1);

  const confMonth=bk.filter(b=>{const ci=pD(b.checkIn);return ci&&ci.getFullYear()===yr&&ci.getMonth()===mo&&b.status==="Confermata";});
  const nSold=bk.filter(b=>b.status==="Confermata").reduce((s,b)=>{
    const ci=pD(b.checkIn),co2=pD(b.checkOut);if(!ci||!co2)return s;
    const ms=new Date(yr,mo,1),me=new Date(yr,mo+1,0);
    if(ci>me||co2<=ms)return s;
    const st=ci<ms?ms:ci,en=co2>me?new Date(me.getTime()+864e5):co2;
    return s+Math.round((en-st)/864e5);
  },0);
  const avail=days*2;
  const occ=avail>0?Math.round(nSold/avail*100):0;
  const mRev=confMonth.reduce((s,b)=>s+(b.grossPrice||0),0);
  const mCost=co.filter(c=>{const d=pD(c.date);return d&&d.getFullYear()===yr&&d.getMonth()===mo&&c.entryType!=="Altro Ricavo";}).reduce((s,c)=>s+(c.amount||0),0);

  const firstDow=(new Date(yr,mo,1).getDay()+6)%7;
  const gridCells=[];
  for(let i=0;i<firstDow;i++)gridCells.push(null);
  for(let d=1;d<=days;d++)gridCells.push(d);
  while(gridCells.length%7!==0)gridCells.push(null);

  const openBkAdd=(unit="Casa Grande",day=null)=>{
    const ci=day?`${yr}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:"";
    setBkForm({...EMPTY_BK,unit,checkIn:ci,cleaningFee:DC[unit]||80,bookingDate:toI(today)});
    setEditBkId(null);setShowBkForm(true);
  };
  const openBkEdit=(b)=>{setBkForm({...b});setEditBkId(b.id);setShowBkForm(true);setSelId(null);};

  const doBkSave=async()=>{
    if(!bkForm.checkIn||!bkForm.checkOut||!bkForm.guestName)return;
    const propId = unitNameToId(bkForm.unit);
    const payload = {
      property_id: propId,
      check_in: bkForm.checkIn,
      check_out: bkForm.checkOut,
      guest_name: bkForm.guestName,
      guests_count: bkForm.guests,
      channel: bkForm.channel,
      gross_price: bkForm.grossPrice,
      cleaning_fee: bkForm.cleaningFee,
      extra_fee: bkForm.extraFee,
      discount: bkForm.discount,
      tourist_tax: bkForm.touristTax,
      commission_eur: bkForm.commissionEur,
      cedolare_eur: bkForm.cedolareEur,
      status: bkForm.status,
      payment_status: bkForm.paymentStatus,
      booking_date: bkForm.bookingDate || toI(today),
      notes: bkForm.notes,
    };
    if(editBkId){
      await supabase.from("bookings").update(payload).eq("id", editBkId);
    } else {
      await supabase.from("bookings").insert(payload);
    }
    setMsg("✓"); setTimeout(()=>setMsg(""),1500);
    await loadAll();
    setShowBkForm(false);
  };
  const doBkDel=async(id)=>{
    await supabase.from("bookings").delete().eq("id", id);
    await loadAll();
    setSelId(null);setShowBkForm(false);
  };

  const openCoAdd=()=>{ setCoForm({...EMPTY_CO,date:toI(today)}); setEditCoId(null);setShowCoForm(true); };
  const openCoEdit=(c)=>{setCoForm({...c});setEditCoId(c.id);setShowCoForm(true);};
  const doCoSave=async()=>{
    if(!coForm.date||!coForm.amount)return;
    const payload = {
      date: coForm.date, category: coForm.category, subcategory: coForm.subcategory,
      supplier: coForm.supplier, unit: coForm.unit,
      amount: parseFloat(coForm.amount)||0, vat_pct: parseFloat(coForm.vatPct)||0,
      recurrence: coForm.recurrence, payment_method: coForm.payMethod, notes: coForm.notes,
      entry_type: coForm.entryType||"Costo",
    };
    if(editCoId){
      await supabase.from("costs").update(payload).eq("id", editCoId);
    } else {
      await supabase.from("costs").insert(payload);
    }
    setMsg("✓"); setTimeout(()=>setMsg(""),1500);
    await loadAll();
    setShowCoForm(false);
  };
  const doCoDel=async(id)=>{
    await supabase.from("costs").delete().eq("id", id);
    await loadAll();
    setShowCoForm(false);
  };

  const updBk=(u)=>{
    const n={...bkForm,...u};
    if(u.unit&&!editBkId)n.cleaningFee=DC[u.unit]||80;
    if(u.checkIn!==undefined||u.checkOut!==undefined||u.guests!==undefined){
      const nights=nC(n.checkIn,n.checkOut);
      if(nights>0&&n.guests>0) n.touristTax = nights*n.guests*TOURIST_TAX_RATE;
    }
    // Suggerisce commissione e cedolare quando cambia canale, lordo, extra o sconto — ma solo se non modificate a mano dall'utente in questa sessione di editing
    if((u.channel!==undefined||u.grossPrice!==undefined||u.extraFee!==undefined||u.discount!==undefined) && !n._manualComm){
      const suggestedRate = CR[n.channel]||0;
      n.commissionEur = Math.round((n.grossPrice||0)*suggestedRate*100)/100;
    }
    if((u.grossPrice!==undefined||u.extraFee!==undefined||u.discount!==undefined) && !n._manualCedolare){
      const base=(n.grossPrice||0)+(n.extraFee||0)-(n.discount||0);
      n.cedolareEur = Math.round(base*CEDOLARE_PCT*100)/100;
    }
    if(u.commissionEur!==undefined) n._manualComm=true;
    if(u.cedolareEur!==undefined) n._manualCedolare=true;
    setBkForm(n);
  };

  const filtBk=bk.filter(b=>{
    if(fUnit!=="Tutte"&&b.unit!==fUnit)return false;
    if(fStat!=="Tutte"&&b.status!==fStat)return false;
    if(search){const q=search.toLowerCase();return b.guestName.toLowerCase().includes(q)||(b.notes||"").toLowerCase().includes(q)||b.channel.toLowerCase().includes(q);}
    return true;
  }).sort((a,b)=>a.checkIn>b.checkIn?1:-1);

  const filtCo=co.filter(c=>{
    if(coFCat!=="Tutte"&&c.category!==coFCat)return false;
    if(coSearch){const q=coSearch.toLowerCase();return c.supplier?.toLowerCase().includes(q)||c.subcategory?.toLowerCase().includes(q)||(c.notes||"").toLowerCase().includes(q)||c.category.toLowerCase().includes(q);}
    return true;
  }).sort((a,b)=>a.date>b.date?-1:1);

  const barStyle=(b)=>{
    const ci=pD(b.checkIn),co2=pD(b.checkOut);
    const ms=new Date(yr,mo,1),me=new Date(yr,mo+1,0);
    const sd=ci<ms?0:ci.getDate()-1;
    const ed=co2>me?days:Math.min(co2.getDate(),days);
    const c=SC[b.status]||SC.Confermata;
    return {left:`${sd*44+2}px`,width:`${(ed-sd)*44-4}px`,background:c.bg,borderLeft:`3px solid ${c.br}`,color:c.tx};
  };
  const unitBookings=(unit)=>{
    const ms=new Date(yr,mo,1),me=new Date(yr,mo+1,0);
    return bk.filter(b=>{if(b.unit!==unit)return false;const ci=pD(b.checkIn),co2=pD(b.checkOut);return ci&&co2&&ci<=me&&co2>ms;});
  };

  const exportBk=()=>{
    const src=tab==="bk"?filtBk:bk;
    const h=["Booking ID","Data Prenotazione","Check-in","Check-out","Notti","Mese","Anno","Unità","Canale","Nome Ospite","N. Ospiti","Prezzo Lordo","Cleaning Fee","Extra Fee","Sconto","Tassa Soggiorno","Commissione %","Commissione €","Cedolare Secca %","Cedolare Secca €","Ricavo Netto","Stato Pagamento","Stato Prenotazione","Note"];
    const rows=src.map(b=>{
      const n=nC(b.checkIn,b.checkOut);const ci=pD(b.checkIn);
      const {gross,cleaning,extra,discount,touristTax,commEur,commPct,cedolareEur,cedolarePct,net}=calcNet(b);
      return[b.id,fI(b.bookingDate),fI(b.checkIn),fI(b.checkOut),n,ci?ci.getMonth()+1:"",ci?ci.getFullYear():"",b.unit,b.channel,b.guestName,b.guests,gross,b.cleaningFee,extra,discount,touristTax.toFixed(2),(commPct*100).toFixed(1)+"%",commEur.toFixed(2),(cedolarePct*100).toFixed(1)+"%",cedolareEur.toFixed(2),net.toFixed(2),b.paymentStatus,b.status,b.notes].map(v=>`"${v}"`).join(";");
    });
    dl("\uFEFF"+h.join(";")+"\n"+rows.join("\n"),`VillaSaline_Bookings_${yr}.csv`);
  };
  const exportCo=()=>{
    const h=["ID","Tipo","Data","Mese","Anno","Categoria","Sottocategoria","Fornitore","Unità","Importo","IVA %","IVA €","Importo Netto","Ricorrente/Una Tantum","Metodo Pagamento","Note"];
    const rows=(tab==="co"?filtCo:co).map(c=>{const d=pD(c.date);const iva=c.amount*(c.vatPct||0);return[c.id,c.entryType||"Costo",fI(c.date),d?d.getMonth()+1:"",d?d.getFullYear():"",c.category,c.subcategory,c.supplier,c.unit,c.amount,(c.vatPct*100).toFixed(0)+"%",iva.toFixed(2),(c.amount-iva).toFixed(2),c.recurrence,c.payMethod,c.notes].map(v=>`"${v}"`).join(";");});
    dl("\uFEFF"+h.join(";")+"\n"+rows.join("\n"),`VillaSaline_Costi_${yr}.csv`);
  };
  const dl=(csv,name)=>{const b=new Blob([csv],{type:"text/csv;charset=utf-8;"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);};

  const BkCard=({b,exp,onTog})=>{
    const n=nC(b.checkIn,b.checkOut),c=SC[b.status];
    const {gross,cleaning,extra,discount,touristTax,commEur,commPct,cedolareEur,cedolarePct,net}=calcNet(b);
    const row=(label,val,sign)=>(
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0"}}>
        <span style={{color:"#888"}}>{sign} {label}</span>
        <span style={{color:"#E8E0D0"}}>€{val.toFixed(2)}</span>
      </div>
    );
    return(
      <div onClick={onTog} style={{background:"rgba(26,39,68,0.5)",borderRadius:10,padding:"10px 12px",marginBottom:6,borderLeft:`3px solid ${c.br}`,cursor:"pointer",border:exp?`1px solid ${c.br}`:"1px solid rgba(255,255,255,0.04)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:500,color:"#E8E0D0"}}>{b.guestName}</span>
              <span style={{fontSize:11,opacity:0.5}}>{CI2[b.channel]}</span>
              <span style={{fontSize:8,padding:"2px 5px",borderRadius:3,background:c.bg,color:c.tx}}>{b.status}</span>
            </div>
            <div style={{fontSize:10,color:"#888",marginTop:3}}>
              <span style={{color:UC[b.unit],fontWeight:500}}>{b.unit}</span> · {fI(b.checkIn)} → {fI(b.checkOut)} · {n}n · {b.guests}osp
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0,marginLeft:6}}>
            <div style={{fontSize:14,fontWeight:400,color:"#C9A96E"}}>€{Number(b.grossPrice).toLocaleString("it-IT")}</div>
            <div style={{fontSize:9,color:"#666"}}>{b.paymentStatus}</div>
          </div>
        </div>
        {exp&&(
          <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{background:"rgba(15,26,46,0.5)",borderRadius:6,padding:"8px 10px",marginBottom:8}}>
              {row("Prezzo Lordo",gross,"+")}
              {row("Cleaning Fee",cleaning,"+")}
              {row("Extra Fee",extra,"+")}
              {row("Sconto",discount,"−")}
              {row("Tassa Soggiorno",touristTax,"+")}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0"}}>
                <span style={{color:"#888"}}>− Commissione ({(commPct*100).toFixed(1)}%)</span>
                <span style={{color:"#E8E0D0"}}>€{commEur.toFixed(2)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0"}}>
                <span style={{color:"#888"}}>− Cedolare secca ({(cedolarePct*100).toFixed(1)}%)</span>
                <span style={{color:"#E8E0D0"}}>€{cedolareEur.toFixed(2)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,paddingTop:5,marginTop:5,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                <span style={{color:"#C9A96E",fontWeight:500}}>= Ricavo Netto</span>
                <span style={{color:"#3DA66A",fontWeight:700}}>€{net.toFixed(2)}</span>
              </div>
            </div>
            {b.notes&&<div style={{fontSize:10,color:"#888",marginBottom:6}}>📝 <span style={{color:"#C9A96E"}}>{b.notes}</span></div>}
            <div style={{display:"flex",gap:6}}>
              <button onClick={e=>{e.stopPropagation();openBkEdit(b);}} style={btnSec}>✏️ Modifica</button>
              <button onClick={e=>{e.stopPropagation();if(confirm("Eliminare?"))doBkDel(b.id);}} style={{...btnSec,borderColor:"rgba(168,68,68,0.3)",color:"#C55",flex:"none",padding:"7px 12px"}}>🗑</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if(loading)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0C1525",color:"#C9A96E",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:300,letterSpacing:4}}>VILLA SALINE</div>
        <div style={{fontSize:11,marginTop:6,opacity:0.4,letterSpacing:2}}>CARICAMENTO...</div>
      </div>
    </div>
  );

  return(
    <div style={{background:"#0C1525",minHeight:"100vh",color:"#E2DCD0",fontFamily:"'Inter',system-ui,-apple-system,sans-serif",maxWidth:480,margin:"0 auto",paddingBottom:68}}>

      <div style={{background:"linear-gradient(135deg,#0F1A2E,#1A2744)",padding:"12px 16px 8px",borderBottom:"1px solid rgba(201,169,110,0.12)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,letterSpacing:3,color:"#C9A96E",fontWeight:500,opacity:0.6}}>VILLA SALINE</div>
            <div style={{fontSize:15,fontWeight:300,letterSpacing:0.5,marginTop:1,color:"#E8E0D0"}}>
              {tab==="cal"?"Calendario":tab==="bk"?"Prenotazioni":"Costi"}
              {msg&&<span style={{fontSize:10,color:"#6B9E7A",marginLeft:6}}>{msg}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <div style={{fontSize:8,color:"#555",letterSpacing:0.5}}>🔗 LIVE DB</div>
            <button onClick={tab==="co"?exportCo:exportBk} style={{background:"none",border:"1px solid rgba(201,169,110,0.2)",borderRadius:5,color:"#C9A96E",padding:"5px 8px",fontSize:9,cursor:"pointer",letterSpacing:0.8}}>CSV ↓</button>
          </div>
        </div>
      </div>

      {tab==="cal"&&<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 16px",background:"#0F1A2E"}}>
          <button onClick={prevMo} style={navBtn}>‹</button>
          <div style={{textAlign:"center",cursor:"pointer"}} onClick={goToday}>
            <div style={{fontSize:15,fontWeight:400,letterSpacing:0.5}}>{MI[mo]} {yr}</div>
            <div style={{fontSize:8,color:"#C9A96E",opacity:0.4,letterSpacing:1,marginTop:1}}>TAP → OGGI</div>
          </div>
          <button onClick={nextMo} style={navBtn}>›</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",padding:"6px 12px",gap:6,background:"#0F1A2E",borderBottom:"1px solid rgba(201,169,110,0.06)"}}>
          {[{l:"OCC.",v:`${occ}%`},{l:"BOOK.",v:confMonth.length},{l:"REV.",v:`€${(mRev/1000).toFixed(1)}k`},{l:"COSTI",v:`€${mCost.toLocaleString("it-IT")}`}].map((x,i)=>(
            <div key={i} style={{background:"rgba(26,39,68,0.45)",borderRadius:7,padding:"5px 4px",textAlign:"center",border:"1px solid rgba(201,169,110,0.05)"}}>
              <div style={{fontSize:8,letterSpacing:1.2,color:"#C9A96E",opacity:0.5}}>{x.l}</div>
              <div style={{fontSize:15,fontWeight:300,color:"#E8E0D0",marginTop:1}}>{x.v}</div>
            </div>
          ))}
        </div>

        <div style={{display:"flex",justifyContent:"center",gap:14,padding:"8px 16px 4px"}}>
          {UNITS.map(u=>(
            <div key={u} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:16,height:5,borderRadius:2,background:UC[u]}}/>
              <span style={{fontSize:9,color:"#888"}}>{u==="Casa Grande"?"CG":u==="Casa Piccola"?"CP":"VI"}</span>
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:5,borderRadius:2,background:"rgba(212,168,67,0.7)"}}/>
            <span style={{fontSize:9,color:"#888"}}>Opz.</span>
          </div>
        </div>

        <div style={{padding:"4px 10px 8px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:3}}>
            {DOW.map((d,i)=>(<div key={d} style={{textAlign:"center",fontSize:9,color:i>=5?"#C9A96E":"#555",letterSpacing:0.5,padding:"2px 0",fontWeight:500}}>{d}</div>))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {gridCells.map((day,i)=>{
              if(!day)return <div key={i}/>;
              const ds=`${yr}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const isToday=ds===todayStr;
              const isSel=selDay===day;
              const occ2=unitsOnDay(day);
              const dw=(new Date(yr,mo,day).getDay()+6)%7;
              const isWe=dw>=5;
              return(
                <div key={i} onClick={()=>setSelDay(selDay===day?null:day)} style={{
                  minHeight:52,borderRadius:6,padding:"3px 2px",cursor:"pointer",
                  background:isSel?"rgba(201,169,110,0.12)":isToday?"rgba(59,125,216,0.08)":isWe?"rgba(255,255,255,0.015)":"rgba(26,39,68,0.2)",
                  border:isSel?"1px solid rgba(201,169,110,0.3)":isToday?"1px solid rgba(59,125,216,0.25)":"1px solid rgba(255,255,255,0.03)",
                  display:"flex",flexDirection:"column"
                }}>
                  <div style={{fontSize:11,fontWeight:isToday?600:300,color:isToday?"#3B7DD8":isSel?"#C9A96E":"#888",textAlign:"center",marginBottom:2}}>{day}</div>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,padding:"0 2px"}}>
                    {occ2.map((o,j)=>(<div key={j} style={{height:5,borderRadius:2,background:o.status==="Opzionata"?`${UC[o.unit]}88`:UC[o.unit],opacity:o.status==="Opzionata"?0.6:0.9}}/>))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selDay&&(
          <div style={{padding:"4px 12px 8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:12,color:"#C9A96E",fontWeight:500}}>{selDay} {MI[mo]} {yr}</div>
              <button onClick={()=>openBkAdd("Casa Grande",selDay)} style={{...btnSec,padding:"5px 10px",fontSize:10}}>+ Prenota</button>
            </div>
            {bookingsOnDay(selDay).length>0?
              bookingsOnDay(selDay).map(b=><BkCard key={b.id} b={b} exp={selId===b.id} onTog={()=>setSelId(selId===b.id?null:b.id)}/>)
              :<div style={{fontSize:11,color:"#555",textAlign:"center",padding:12}}>Nessuna prenotazione — giorno libero</div>}
          </div>
        )}

        {!selDay&&(
          <div style={{padding:"4px 12px 12px"}}>
            <div style={{fontSize:10,letterSpacing:1.5,color:"#C9A96E",marginBottom:6,fontWeight:500}}>PRENOTAZIONI MESE ({monthBk.length})</div>
            {monthBk.map(b=><BkCard key={b.id} b={b} exp={selId===b.id} onTog={()=>setSelId(selId===b.id?null:b.id)}/>)}
            {monthBk.length===0&&<div style={{textAlign:"center",padding:16,color:"#555",fontSize:11}}>Nessuna prenotazione</div>}
          </div>
        )}
      </>}

      {tab==="bk"&&<>
        <div style={{padding:"10px 14px 6px"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Cerca ospite, canale, note..." style={{...IS,fontSize:13,background:"rgba(26,39,68,0.5)"}}/>
        </div>
        <div style={{display:"flex",gap:5,padding:"4px 14px 6px",overflowX:"auto"}}>
          {["Tutte",...UNITS].map(u=>(<button key={u} onClick={()=>setFUnit(u)} style={{...pill,...(fUnit===u?{background:"rgba(201,169,110,0.12)",borderColor:"rgba(201,169,110,0.35)",color:"#C9A96E"}:{})}}>{u==="Villa Intera"?"V.Intera":u}</button>))}
        </div>
        <div style={{display:"flex",gap:5,padding:"0 14px 8px",overflowX:"auto"}}>
          {["Tutte",...STATUSES].map(s=>(<button key={s} onClick={()=>setFStat(s)} style={{...pill,...(fStat===s?{background:s==="Tutte"?"rgba(201,169,110,0.12)":SC[s]?.bg,borderColor:s==="Tutte"?"rgba(201,169,110,0.35)":SC[s]?.br,color:s==="Tutte"?"#C9A96E":SC[s]?.tx}:{})}}>{s}</button>))}
        </div>
        <div style={{padding:"0 14px 6px",display:"flex",gap:10,fontSize:10,color:"#666"}}>
          <span>{filtBk.length} prenot.</span><span>·</span>
          <span>€{filtBk.filter(b=>b.status==="Confermata").reduce((s,b)=>s+b.grossPrice,0).toLocaleString("it-IT")} lordi</span>
        </div>
        <div style={{padding:"0 14px 16px"}}>
          {filtBk.map(b=><BkCard key={b.id} b={b} exp={selId===b.id} onTog={()=>setSelId(selId===b.id?null:b.id)}/>)}
          {filtBk.length===0&&<div style={{textAlign:"center",padding:20,color:"#555",fontSize:11}}>Nessun risultato</div>}
        </div>
      </>}

      {tab==="co"&&<>
        <div style={{padding:"10px 14px 6px"}}>
          <input value={coSearch} onChange={e=>setCoSearch(e.target.value)} placeholder="🔍  Cerca fornitore, categoria, note..." style={{...IS,fontSize:13,background:"rgba(26,39,68,0.5)"}}/>
        </div>
        <div style={{display:"flex",gap:5,padding:"4px 14px 8px",overflowX:"auto"}}>
          {["Tutte","Pulizie","Lavanderia","Utilities","Manutenzione","Marketing","Altro"].map(c=>(<button key={c} onClick={()=>setCoFCat(c)} style={{...pill,...(coFCat===c?{background:"rgba(201,169,110,0.12)",borderColor:"rgba(201,169,110,0.35)",color:"#C9A96E"}:{})}}>{c}</button>))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",padding:"0 14px 10px",gap:6}}>
          {[
            {l:"COSTI",v:`€${filtCo.filter(c=>c.entryType!=="Altro Ricavo").reduce((s,c)=>s+c.amount,0).toLocaleString("it-IT")}`,c:"#ED7D31"},
            {l:"ALTRI RICAVI",v:`€${filtCo.filter(c=>c.entryType==="Altro Ricavo").reduce((s,c)=>s+c.amount,0).toLocaleString("it-IT")}`,c:"#3DA66A"},
            {l:"RICORRENTI",v:`€${filtCo.filter(c=>c.recurrence==="Ricorrente"&&c.entryType!=="Altro Ricavo").reduce((s,c)=>s+c.amount,0).toLocaleString("it-IT")}`},
            {l:"UNA TANTUM",v:`€${filtCo.filter(c=>c.recurrence==="Una Tantum"&&c.entryType!=="Altro Ricavo").reduce((s,c)=>s+c.amount,0).toLocaleString("it-IT")}`},
          ].map((x,i)=>(
            <div key={i} style={{background:"rgba(26,39,68,0.45)",borderRadius:7,padding:"6px 4px",textAlign:"center",border:"1px solid rgba(201,169,110,0.05)"}}>
              <div style={{fontSize:7,letterSpacing:1,color:"#C9A96E",opacity:0.5}}>{x.l}</div>
              <div style={{fontSize:13,fontWeight:300,color:x.c||"#E8E0D0",marginTop:1}}>{x.v}</div>
            </div>
          ))}
        </div>
        <div style={{padding:"0 14px 16px"}}>
          {filtCo.map(c=>{
            const iva=c.amount*(c.vatPct||0);
            const isRicavo=c.entryType==="Altro Ricavo";
            const clr=isRicavo?"#3DA66A":"#ED7D31";
            return(
              <div key={c.id} onClick={()=>setSelId(selId===c.id?null:c.id)} style={{background:"rgba(26,39,68,0.5)",borderRadius:10,padding:"10px 12px",marginBottom:6,borderLeft:`3px solid ${clr}`,cursor:"pointer",border:selId===c.id?`1px solid ${clr}`:"1px solid rgba(255,255,255,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:13,fontWeight:500,color:"#E8E0D0"}}>{c.category}</span>
                      {isRicavo&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:3,background:"rgba(45,122,79,0.25)",color:"#6FCF8E"}}>RICAVO</span>}
                    </div>
                    <div style={{fontSize:10,color:"#888",marginTop:2}}>{c.subcategory&&<span>{c.subcategory} · </span>}{c.supplier&&<span>{c.supplier} · </span>}{fI(c.date)}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:400,color:clr}}>{isRicavo?"+":""}€{Number(c.amount).toLocaleString("it-IT")}</div>
                    <div style={{fontSize:9,color:"#666"}}>{c.unit}</div>
                  </div>
                </div>
                {selId===c.id&&(
                  <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,fontSize:10,color:"#888",marginBottom:6}}>
                      <div>IVA: <span style={{color:"#E8E0D0"}}>{(c.vatPct*100).toFixed(0)}% (€{iva.toFixed(2)})</span></div>
                      <div>Netto: <span style={{color:"#E8E0D0"}}>€{(c.amount-iva).toFixed(2)}</span></div>
                      <div>Tipo: <span style={{color:"#E8E0D0"}}>{c.recurrence}</span></div>
                      <div>Pagamento: <span style={{color:"#E8E0D0"}}>{c.payMethod}</span></div>
                    </div>
                    {c.notes&&<div style={{fontSize:10,color:"#888",marginBottom:6}}>📝 <span style={{color:"#C9A96E"}}>{c.notes}</span></div>}
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={e=>{e.stopPropagation();openCoEdit(c);}} style={btnSec}>✏️ Modifica</button>
                      <button onClick={e=>{e.stopPropagation();if(confirm("Eliminare?"))doCoDel(c.id);}} style={{...btnSec,borderColor:"rgba(168,68,68,0.3)",color:"#C55",flex:"none",padding:"7px 12px"}}>🗑</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtCo.length===0&&<div style={{textAlign:"center",padding:20,color:"#555",fontSize:11}}>Nessun costo registrato</div>}
        </div>
      </>}

      <button onClick={()=>tab==="co"?openCoAdd():openBkAdd()} style={{position:"fixed",bottom:74,right:14,width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#C9A96E,#A88840)",border:"none",color:"#0C1525",fontSize:22,fontWeight:300,cursor:"pointer",zIndex:50,boxShadow:"0 4px 14px rgba(201,169,110,0.3)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"linear-gradient(0deg,#0C1525,#111D32)",borderTop:"1px solid rgba(201,169,110,0.1)",display:"flex",maxWidth:480,margin:"0 auto",zIndex:40}}>
        {[{id:"cal",ic:"📅",lb:"Calendario"},{id:"bk",ic:"📋",lb:"Prenotazioni"},{id:"co",ic:"💰",lb:"Costi"}].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setSelId(null);setSelDay(null);}} style={{flex:1,padding:"8px 0 10px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:1,color:tab===t.id?"#C9A96E":"#4a4a4a"}}>
            <span style={{fontSize:17}}>{t.ic}</span>
            <span style={{fontSize:8,letterSpacing:0.6,fontWeight:tab===t.id?500:400}}>{t.lb}</span>
          </button>
        ))}
      </div>

      {showBkForm&&(
        <div style={overlay} onClick={()=>setShowBkForm(false)}>
          <div onClick={e=>e.stopPropagation()} style={modal}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:500,color:"#C9A96E"}}>{editBkId?"✏️ Modifica":"➕ Nuova Prenotazione"}</div>
              <button onClick={()=>setShowBkForm(false)} style={closeBtn}>✕</button>
            </div>
            <div style={{display:"flex",gap:5,marginBottom:10}}>
              {UNITS.map(u=>(<button key={u} onClick={()=>updBk({unit:u})} style={{flex:1,padding:"7px 3px",borderRadius:7,fontSize:10,cursor:"pointer",textAlign:"center",border:"2px solid",...(bkForm.unit===u?{background:`${UC[u]}20`,borderColor:UC[u],color:UC[u]}:{background:"transparent",borderColor:"rgba(255,255,255,0.06)",color:"#555"})}}>{u}</button>))}
            </div>
            <div style={{display:"grid",gap:8}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <label style={LS}>CHECK-IN *<input type="date" value={bkForm.checkIn} onChange={e=>updBk({checkIn:e.target.value})} style={IS}/></label>
                <label style={LS}>CHECK-OUT *<input type="date" value={bkForm.checkOut} onChange={e=>updBk({checkOut:e.target.value})} style={IS}/></label>
              </div>
              <label style={LS}>NOME OSPITE *<input value={bkForm.guestName} placeholder="Nome e Cognome" onChange={e=>updBk({guestName:e.target.value})} style={IS}/></label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <label style={LS}>CANALE<select value={bkForm.channel} onChange={e=>updBk({channel:e.target.value})} style={IS}>{CHANNELS.map(c=><option key={c}>{c}</option>)}</select></label>
                <label style={LS}>OSPITI<input type="number" value={bkForm.guests} min="1" max="12" onChange={e=>updBk({guests:parseInt(e.target.value)||1})} onFocus={e=>e.target.select()} style={IS}/></label>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
                <label style={LS}>PREZZO LORDO €<input type="number" value={bkForm.grossPrice} min="0" step="10" onChange={e=>updBk({grossPrice:parseFloat(e.target.value)||0})} onFocus={e=>e.target.select()} style={IS}/></label>
                <label style={LS}>CLEANING €<input type="number" value={bkForm.cleaningFee} min="0" onChange={e=>updBk({cleaningFee:parseFloat(e.target.value)||0})} onFocus={e=>e.target.select()} style={IS}/></label>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <label style={LS}>EXTRA €<input type="number" value={bkForm.extraFee} min="0" onChange={e=>updBk({extraFee:parseFloat(e.target.value)||0})} onFocus={e=>e.target.select()} style={IS}/></label>
                <label style={LS}>SCONTO €<input type="number" value={bkForm.discount} min="0" onChange={e=>updBk({discount:parseFloat(e.target.value)||0})} onFocus={e=>e.target.select()} style={IS}/></label>
              </div>
              <label style={LS}>TASSA SOGGIORNO € <span style={{opacity:0.6}}>(auto: notti × ospiti × €2)</span>
                <input type="number" value={bkForm.touristTax} min="0" onChange={e=>updBk({touristTax:parseFloat(e.target.value)||0})} onFocus={e=>e.target.select()} style={IS}/>
              </label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <label style={LS}>COMMISSIONE € <span style={{opacity:0.6}}>({bkForm.grossPrice>0?((bkForm.commissionEur/bkForm.grossPrice)*100).toFixed(1):"0.0"}%)</span>
                  <input type="number" value={bkForm.commissionEur} min="0" step="0.01" onChange={e=>updBk({commissionEur:parseFloat(e.target.value)||0})} onFocus={e=>e.target.select()} style={IS}/>
                </label>
                <label style={LS}>CEDOLARE SECCA € <span style={{opacity:0.6}}>({(bkForm.grossPrice+bkForm.extraFee-bkForm.discount)>0?((bkForm.cedolareEur/(bkForm.grossPrice+bkForm.extraFee-bkForm.discount))*100).toFixed(1):"0.0"}%)</span>
                  <input type="number" value={bkForm.cedolareEur} min="0" step="0.01" onChange={e=>updBk({cedolareEur:parseFloat(e.target.value)||0})} onFocus={e=>e.target.select()} style={IS}/>
                </label>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <label style={LS}>STATO<select value={bkForm.status} onChange={e=>updBk({status:e.target.value})} style={IS}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
                <label style={LS}>PAGAMENTO<select value={bkForm.paymentStatus} onChange={e=>updBk({paymentStatus:e.target.value})} style={IS}>{PAY_ST.map(s=><option key={s}>{s}</option>)}</select></label>
              </div>
              <label style={LS}>NOTE<input value={bkForm.notes} placeholder="Note opzionali" onChange={e=>updBk({notes:e.target.value})} style={IS}/></label>
              {bkForm.checkIn&&bkForm.checkOut&&bkForm.grossPrice>0&&(()=>{
                const {gross,cleaning,extra,discount,touristTax,commEur,commPct,cedolareEur,cedolarePct,net}=calcNet(bkForm);
                const n=nC(bkForm.checkIn,bkForm.checkOut);
                const frow=(label,val,sign)=>(
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"1px 0"}}>
                    <span style={{color:"#888"}}>{sign} {label}</span><span style={{color:"#E8E0D0"}}>€{val.toFixed(2)}</span>
                  </div>
                );
                return(<div style={{background:"rgba(201,169,110,0.06)",borderRadius:7,padding:"9px 11px",border:"1px solid rgba(201,169,110,0.1)"}}>
                  <div style={{fontSize:10,color:"#C9A96E",marginBottom:5,opacity:0.8}}>{n} notti · €{n>0?Math.round(gross/n):0}/notte</div>
                  {frow("Prezzo Lordo",gross,"+")}
                  {frow("Cleaning Fee",cleaning,"+")}
                  {frow("Extra Fee",extra,"+")}
                  {frow("Sconto",discount,"−")}
                  {frow("Tassa Soggiorno",touristTax,"+")}
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"1px 0"}}>
                    <span style={{color:"#888"}}>− Commissione ({(commPct*100).toFixed(1)}%)</span><span style={{color:"#E8E0D0"}}>€{commEur.toFixed(2)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"1px 0"}}>
                    <span style={{color:"#888"}}>− Cedolare secca ({(cedolarePct*100).toFixed(1)}%)</span><span style={{color:"#E8E0D0"}}>€{cedolareEur.toFixed(2)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,paddingTop:5,marginTop:5,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                    <span style={{color:"#C9A96E",fontWeight:500}}>= Ricavo Netto</span><span style={{color:"#3DA66A",fontWeight:700}}>€{net.toFixed(2)}</span>
                  </div>
                </div>);
              })()}
              <button onClick={doBkSave} disabled={!bkForm.checkIn||!bkForm.checkOut||!bkForm.guestName} style={{...saveBtn,background:(!bkForm.checkIn||!bkForm.checkOut||!bkForm.guestName)?"rgba(201,169,110,0.15)":"linear-gradient(135deg,#C9A96E,#A88840)",color:(!bkForm.checkIn||!bkForm.checkOut||!bkForm.guestName)?"#555":"#0C1525"}}>{editBkId?"SALVA MODIFICHE":"AGGIUNGI PRENOTAZIONE"}</button>
            </div>
          </div>
        </div>
      )}

      {showCoForm&&(
        <div style={overlay} onClick={()=>setShowCoForm(false)}>
          <div onClick={e=>e.stopPropagation()} style={modal}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:500,color:coForm.entryType==="Altro Ricavo"?"#3DA66A":"#ED7D31"}}>{editCoId?"✏️ Modifica":coForm.entryType==="Altro Ricavo"?"➕ Nuovo Ricavo":"➕ Nuovo Costo"}</div>
              <button onClick={()=>setShowCoForm(false)} style={closeBtn}>✕</button>
            </div>
            <div style={{display:"flex",gap:5,marginBottom:10}}>
              {ENTRY_TYPES.map(t=>{
                const active=coForm.entryType===t;
                const clr=t==="Altro Ricavo"?"#3DA66A":"#ED7D31";
                return(
                  <button key={t} onClick={()=>setCoForm({...coForm,entryType:t})} style={{
                    flex:1,padding:"8px 4px",borderRadius:7,fontSize:11,cursor:"pointer",textAlign:"center",
                    border:"2px solid",...(active?{background:`${clr}20`,borderColor:clr,color:clr}:{background:"transparent",borderColor:"rgba(255,255,255,0.06)",color:"#555"})
                  }}>{t}</button>
                );
              })}
            </div>
            <div style={{display:"grid",gap:8}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <label style={LS}>DATA *<input type="date" value={coForm.date} onChange={e=>setCoForm({...coForm,date:e.target.value})} style={IS}/></label>
                <label style={LS}>IMPORTO € *<input type="number" value={coForm.amount} min="0" step="1" onChange={e=>setCoForm({...coForm,amount:e.target.value})} onFocus={e=>e.target.select()} style={IS}/></label>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <label style={LS}>CATEGORIA<select value={coForm.category} onChange={e=>setCoForm({...coForm,category:e.target.value})} style={IS}>{COST_CATS.map(c=><option key={c}>{c}</option>)}</select></label>
                <label style={LS}>SOTTOCATEGORIA<input value={coForm.subcategory} placeholder="es. Check-out" onChange={e=>setCoForm({...coForm,subcategory:e.target.value})} style={IS}/></label>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <label style={LS}>FORNITORE<input value={coForm.supplier} placeholder="es. Maria Pulizie" onChange={e=>setCoForm({...coForm,supplier:e.target.value})} style={IS}/></label>
                <label style={LS}>UNITÀ<select value={coForm.unit} onChange={e=>setCoForm({...coForm,unit:e.target.value})} style={IS}>{[...UNITS,"Generale"].map(u=><option key={u}>{u}</option>)}</select></label>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <label style={LS}>IVA %<select value={coForm.vatPct} onChange={e=>setCoForm({...coForm,vatPct:parseFloat(e.target.value)})} style={IS}><option value="0">0%</option><option value="0.04">4%</option><option value="0.10">10%</option><option value="0.22">22%</option></select></label>
                <label style={LS}>TIPO<select value={coForm.recurrence} onChange={e=>setCoForm({...coForm,recurrence:e.target.value})} style={IS}><option>Ricorrente</option><option>Una Tantum</option></select></label>
                <label style={LS}>PAGAMENTO<select value={coForm.payMethod} onChange={e=>setCoForm({...coForm,payMethod:e.target.value})} style={IS}>{PAY_METHODS.map(p=><option key={p}>{p}</option>)}</select></label>
              </div>
              <label style={LS}>NOTE<input value={coForm.notes} placeholder="Note opzionali" onChange={e=>setCoForm({...coForm,notes:e.target.value})} style={IS}/></label>
              {coForm.amount>0&&(<div style={{background:"rgba(237,125,49,0.06)",borderRadius:7,padding:"7px 10px",border:"1px solid rgba(237,125,49,0.1)",display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:"#888"}}>IVA: €{(parseFloat(coForm.amount)*(coForm.vatPct||0)).toFixed(2)}</span><span style={{color:"#ED7D31",fontWeight:500}}>Netto: €{(parseFloat(coForm.amount)*(1-(coForm.vatPct||0))).toFixed(2)}</span></div>)}
              <button onClick={doCoSave} disabled={!coForm.date||!coForm.amount} style={{...saveBtn,
                background:(!coForm.date||!coForm.amount)?"rgba(150,150,150,0.15)":coForm.entryType==="Altro Ricavo"?"linear-gradient(135deg,#3DA66A,#2D7A4F)":"linear-gradient(135deg,#ED7D31,#C66A20)",
                color:(!coForm.date||!coForm.amount)?"#555":"#0C1525"}}>{editCoId?"SALVA MODIFICHE":coForm.entryType==="Altro Ricavo"?"AGGIUNGI RICAVO":"AGGIUNGI COSTO"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn={background:"none",border:"none",color:"#C9A96E",fontSize:24,cursor:"pointer",padding:"4px 14px"};
const pill={padding:"4px 10px",borderRadius:16,fontSize:9,cursor:"pointer",whiteSpace:"nowrap",border:"1px solid rgba(255,255,255,0.06)",background:"transparent",color:"#666",letterSpacing:0.3,fontFamily:"inherit"};
const btnSec={flex:1,padding:"7px",borderRadius:6,border:"1px solid rgba(201,169,110,0.25)",background:"none",color:"#C9A96E",fontSize:11,cursor:"pointer",fontFamily:"inherit"};
const overlay={position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"};
const modal={background:"#141E33",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",padding:"16px 16px 28px",border:"1px solid rgba(201,169,110,0.1)",borderBottom:"none"};
const closeBtn={background:"none",border:"none",color:"#555",fontSize:18,cursor:"pointer",padding:"4px 8px"};
const saveBtn={padding:"13px",borderRadius:8,border:"none",fontSize:13,fontWeight:500,letterSpacing:0.8,cursor:"pointer",marginTop:2,fontFamily:"inherit"};
