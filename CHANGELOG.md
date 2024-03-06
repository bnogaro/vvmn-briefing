## 0.2.1 (2024-03-06)

### Fix

- woops, puts back NOTAM, SUPAIP and AZBA removed in 55b0d32

## 0.2.0 (2024-03-06)

### Feat

- automatic query of QNH from Castres
- automatically fetch sunset time from api.sunrise-sunset.org

## 0.1.0 (2024-03-06)

### Feat

- adds back working FL table
- switch to arome for wind forecast
- add rain forecast (arome)
- initial commit with working briefing

### Fix

- arome rain forecast source switched back from 'archives' to 'runs'
- remove reference to local files, not created
- fixes rain forecast, removes problematic QNH table
- https for every URL
- fixing oversized iframes
- all external links should be https
