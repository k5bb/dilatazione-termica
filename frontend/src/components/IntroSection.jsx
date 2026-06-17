import { useState } from 'react'

const SECTIONS = [
  {
    title: 'Il fenomeno fisico',
    content: `Quando un liquido viene riscaldato o raffreddato, il suo volume cambia. Per una bevanda alcolica in bottiglia questo effetto è particolarmente rilevante perché acqua ed etanolo si dilatano in modo diverso e non lineare — e in senso opposto rispetto al vetro del contenitore, che si espande molto meno.

La **dilatazione termica apparente** è la variazione netta di volume del contenuto tra la temperatura di imbottigliamento e quella di stoccaggio o vendita: un vino a 12% vol. in una bottiglia da 750 mL riempita a 10 °C occupa circa 6 mL in più a 35 °C. Se il liquido è già arrivato al bordo del collo, quel volume non ha spazio — con rischio di perdita di tenuta o tappo espulso.`,
  },
  {
    title: 'La normativa europea',
    content: `La **Direttiva CEE 76/211** stabilisce che il volume di un pre-imballaggio deve essere misurato a **20 °C** (temperatura di riferimento OIV, confermata da OENO 556-2016). La tolleranza ammessa (**TNE**, Tolleranza Negativa Errore) dipende dal volume nominale: per una bottiglia da 750 mL è ±15 mL.

Questo significa che non basta riempire al livello corretto alla temperatura di imbottigliamento: occorre calcolare dove si troverà il pelo liquido a 20 °C e verificare che il volume risultante rientri nella banda ±TNE rispetto al nominale.`,
  },
  {
    title: 'Come funziona l\'app',
    content: `L'app integra le equazioni di stato per miscele acqua-etanolo (Lallemand-Vinogradov), la dilatazione termica del vetro borosilicato e il profilo geometrico del collo bottiglia.

**Cosa inserisci:**
- Temperature di imbottigliamento e stoccaggio
- Gradazione alcolica, volume nominale, livello di riempimento dalla scheda tecnica
- Profilo del collo (importa la scheda tecnica PDF oppure scegli un modello)

**Cosa ottieni:**
- Il livello di riempimento consigliato alla temperatura di imbottigliamento
- Il volume calcolato a 20 °C con verifica di conformità CEE
- Il grafico del volume al variare della temperatura (sweep 0–35 °C)
- Il dettaglio della contribuzione di acqua, etanolo e vetro alla variazione di volume`,
  },
]

export default function IntroSection() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  return (
    <div className="glass rounded-lg overflow-hidden mb-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left group"
      >
        <div className="flex items-center gap-3">
          <span className="text-blue-400/80 text-sm font-light">ⓘ</span>
          <span className="text-xs font-semibold tracking-widest uppercase text-white/50 group-hover:text-white/70 transition-colors">
            Dilatazione termica apparente — principio fisico e normativa
          </span>
        </div>
        <span className="text-white/30 text-xs group-hover:text-white/50 transition-colors">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/8">
          {/* Tab bar */}
          <div className="flex border-b border-white/8">
            {SECTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`flex-1 px-3 py-2.5 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
                  active === i
                    ? 'text-blue-300 border-b-2 border-blue-400 -mb-px bg-blue-500/5'
                    : 'text-white/35 hover:text-white/60'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="px-6 py-5">
            {SECTIONS[active].content.split('\n\n').map((para, i) => (
              <p key={i} className="text-sm text-white/65 leading-relaxed mb-3 last:mb-0">
                {para.split(/(\*\*[^*]+\*\*)/).map((chunk, j) =>
                  chunk.startsWith('**') && chunk.endsWith('**')
                    ? <strong key={j} className="text-white/90 font-semibold">{chunk.slice(2, -2)}</strong>
                    : chunk
                )}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
