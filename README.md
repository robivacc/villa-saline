# Villa Saline — Gestionale

## Deploy su Vercel

1. Carica questa cartella su GitHub (nuovo repository "villa-saline")
2. Vai su vercel.com → "Add New Project" → importa il repository
3. Nelle "Environment Variables" aggiungi:
   - `NEXT_PUBLIC_SUPABASE_URL` = https://mgrcwjptmmeybrodknpy.supabase.co
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = sb_publishable_UYL3voAdKfKkXK08G7udvw_oCJBN-IH
4. Deploy

## Database

Lo schema SQL va eseguito una volta in Supabase → SQL Editor (vedi file VillaSaline_DatabaseSchema.sql)

## URL Admin

Dopo il deploy, l'app sarà su: https://tuo-progetto.vercel.app/admin
