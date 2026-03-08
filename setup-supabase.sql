-- ==============================================================================
-- 🚀 SCRIPT SQL POUR LA BASE DE DONNÉES SUPABASE 🚀
-- 
-- Exécutez ce script dans l'éditeur SQL de Supabase pour créer ou mettre à jour 
-- la table `memoires` selon la nouvelle structure demandée pour votre application.
-- ==============================================================================

-- 1. Si vous aviez déjà une ancienne table `memoires` avec une structure différente,
--    nous allons la supprimer pour éviter les conflits. (ATTENTION: supprime l'historique)
DROP TABLE IF EXISTS memoires CASCADE;

-- 2. Création de la table avec la structure exacte demandée
CREATE TABLE memoires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client TEXT NOT NULL,
  date_memoire DATE NOT NULL,
  total_prime NUMERIC(15, 3) NOT NULL,
  statut TEXT DEFAULT 'Non payée',
  date_paiement DATE,
  details JSONB -- Optionnel : Permet de sauvegarder dans la base les lignes du tableau généré.
);

-- 3. Désactiver temporairement la sécurité RLS (Row Level Security) 
--    pour que votre application puisse enregistrer sans restriction d'authentification.
ALTER TABLE memoires DISABLE ROW LEVEL SECURITY;

-- 4. Message de confirmation
SELECT 'Table "memoires" configurée avec succès !' as message;
ALTER TABLE memoires ADD COLUMN IF NOT EXISTS titre TEXT DEFAULT 'MEMOIRE DE REGLEMENT'; 
