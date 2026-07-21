fetch("https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.350.apk?download=", { method: 'HEAD' })
  .then(res => console.log(res.ok))
  .catch(err => console.error(err));
