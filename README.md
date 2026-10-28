# CLARA 5.0 (indépendante) + Veo Pro

## Contenu du dépôt (à la racine)
netlify.toml, package.json, netlify/functions/ (clara-auth.js, cga.js, sygalin.js, veo.js), public/ (CLARA).

## Mise en ligne
Netlify : Import from Git, aucun réglage. Netlify installe tout seul la dépendance @netlify/blobs (package.json).
Variables facultatives (Netlify > Site configuration > Environment variables) :
- CLARA_INVITE : code d'invitation obligatoire pour créer un compte (recommandé : sinon tout le monde peut s'inscrire).
- CLARA_SECRET : phrase secrète pour signer les sessions et chiffrer les clés Google Authenticator (sinon une clé est générée et conservée automatiquement).

## Comptes
Inscription : e-mail + mot de passe + Google Authenticator (clé / lien / QR code), puis 8 codes de secours.
Connexion : e-mail + mot de passe + code à 6 chiffres (ou un code de secours). Verrouillage 15 min après 5 échecs.
Le premier compte créé est administrateur. Aucun mot de passe Veo ni moteur n'est conservé sur le serveur.

## Connexions (première connexion, puis Paramètres > Connexions)
- Veo Pro : réabonnement, factures, commissions, retrait.
- Moteur de recherche et réactivation, interchangeable : VisionsCanal ou CGA Canal (MyPOS).
Les identifiants restent enregistrés sur l'appareil. Si un moteur tombe, CLARA continue de fonctionner (données enregistrées, Veo) et on bascule sur l'autre.

## Ajouter un autre moteur
Dans public/index.html, objet ENGINES : ajouter une entrée { hint, find(field, valeur), react(path, body), test({id, pw}) } puis un bouton dans la page « Connexions ».

## Nouveautés 5.1 : onglet CGA
- Nouvel onglet « CGA » : recherche (N° abonné, décodeur, téléphone, e-mail) et réactivation, pensé pour le téléphone.
- Une seule connexion à CGA Canal : la session est conservée sur l'appareil et réutilisée à chaque recherche ; une nouvelle connexion n'a lieu que si elle a expiré. Cela évite le blocage d'accès provoqué par les connexions répétées.
- Bouton « Écran allumé » : garde l'écran allumé tant que CLARA est ouverte (Android, iOS 16.4 ou plus récent).
- Mise à jour : remplacer les fichiers sur Netlify (cga.js et public/).

## Nouveautés 5.2 : recharge MyPOS (Sygalin SAS)
- Dans l'onglet CGA : carte « Recharge MyPOS » (Orange Money ou MTN MoMo), reprise de la méthode d'Aria.
- Compte Sygalin : à enregistrer une fois dans l'onglet (identifiant + mot de passe, conservés uniquement sur l'appareil).
- Garde-fous : montant de 1 000 à 500 000 FCFA, numéro vérifié selon l'opérateur, confirmation avant envoi, blocage de la même recharge pendant 90 s, jamais de nouvel essai automatique du paiement. Variables facultatives RECHARGE_MIN et RECHARGE_MAX (Netlify > Environment variables).
- Suivi : le ticket est suivi automatiquement, ou à la demande avec « Vérifier l'état ».
- Une seule connexion à Sygalin : la session est réutilisée tant qu'elle est valable.
- Mise à jour : remplacer public/ et netlify/functions/ (nouveau fichier sygalin.js).
