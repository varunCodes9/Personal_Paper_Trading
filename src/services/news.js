// import fs from 'fs/promises';
// import News from '../models/News.js';
// import config from '../config/index.js';

// const POSITIVE_KEYWORDS = ['profit', 'growth', 'acquires'];
// const NEGATIVE_KEYWORDS = ['loss', 'fraud', 'cut'];

// export async function processNews() {
//   // Read news.txt
//   const data = await fs.readFile('news.txt', 'utf-8');
//   const headlines = data.split('\n').filter(line => line.trim());

//   // Calculate sentiment
//   const newsDocs = headlines.map(headline => {
//     let score = 0;
//     const lowerHeadline = headline.toLowerCase();
    
//     POSITIVE_KEYWORDS.forEach(word => {
//       if (lowerHeadline.includes(word)) score += 0.5;
//     });
    
//     NEGATIVE_KEYWORDS.forEach(word => {
//       if (lowerHeadline.includes(word)) score -= 0.5;
//     });
    
//     score = Math.min(1, Math.max(-1, score)); // Clamp
    
//     return new News({ headline, sentiment: score });
//   });

//   // Save to DB
//   await News.insertMany(newsDocs);
//   return newsDocs;
// }

import fs from 'fs';
import News from '../models/News.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

const POSITIVE_KEYWORDS = ['profit', 'profits', 'growth', 'growing', 'acquires', 'acquisition', 'upgrade', 'record high', 'wins', 'secured'];
const NEGATIVE_KEYWORDS = ['loss', 'losses', 'fraud', 'cut', 'downgrade', 'lawsuit', 'penalty'];


export async function processNews() {
  try {
    // Read news.txt (ensure file exists)
    if (!fs.existsSync('news.txt')) {
      logger.warn('news.txt file not found');
      return [];
    }

    const data = await fs.promises.readFile('news.txt', 'utf-8');
    const headlines = data.split('\n')
      .filter(line => line.trim())
      .map(line => line.trim());

    if (headlines.length === 0) {
      logger.warn('No headlines found in news.txt');
      return [];
    }

    // Process each headline
    const newsDocs = headlines.map(headline => {
      let score = 0;
      const lowerHeadline = headline.toLowerCase();
      console.log('Processing headline:', headline);
      console.log('Lowercase:', lowerHeadline);
      POSITIVE_KEYWORDS.forEach(word => {
        if (lowerHeadline.includes(word)) {
          console.log(`Found positive keyword: ${word}`);
          score += 0.5;
        }
      });
      NEGATIVE_KEYWORDS.forEach(word => {
        if (lowerHeadline.includes(word)) {
          console.log(`Found negative keyword: ${word}`);
          score -= 0.5;
        }
      });
      
      // Normalize score between -1 and 1
      score = Math.max(-1, Math.min(1, score));
      
      return new News({
        symbol: extractSymbolFromHeadline(headline), // Implement this
        headline,
        sentiment: score,
        timestamp: new Date()
      });
    });

    // Save to database
    await News.deleteMany({}); // Clear old news
    await News.insertMany(newsDocs);
    logger.info(`Processed ${newsDocs.length} news items`);
    return newsDocs;
  } catch (error) {
    logger.error('News processing failed:', error);
    throw error;
  }
}

// Helper function - implement based on your news format
function extractSymbolFromHeadline(headline) {
  // Example: "RELIANCE reports 20% profit growth" → "RELIANCE"
  const symbols = ['RELIANCE', 'TCS']; // Your watchlist
  return symbols.find(symbol => headline.includes(symbol));
}