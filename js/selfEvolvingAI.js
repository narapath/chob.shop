// Self-Evolving AI Learning System for ChobShop
// เรียนรู้และปรับปรุงตัวเองจากผลลัพธ์จริง

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const LEARNING_DATA_PATH = path.join(DATA_DIR, 'learning_data.json');
const KEYWORD_WEIGHTS_PATH = path.join(DATA_DIR, 'keyword_weights.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('📁 Created data directory');
}

// Initialize files if they don't exist
if (!fs.existsSync(LEARNING_DATA_PATH)) {
  fs.writeFileSync(LEARNING_DATA_PATH, JSON.stringify({
    totalPredictions: 0,
    correctPredictions: 0,
    corrections: [],
    categoryHistory: {}
  }, null, 2));
  console.log('📄 Created learning_data.json');
}

if (!fs.existsSync(KEYWORD_WEIGHTS_PATH)) {
  fs.writeFileSync(KEYWORD_WEIGHTS_PATH, JSON.stringify({}, null, 2));
  console.log('📄 Created keyword_weights.json');
}

class SelfEvolvingAI {
  constructor() {
    this.learningData = this.loadData(LEARNING_DATA_PATH);
    this.keywordWeights = this.loadData(KEYWORD_WEIGHTS_PATH);
    console.log('🧠 AI Learning System initialized');
    console.log(`   - Total predictions: ${this.learningData.totalPredictions}`);
    console.log(`   - Corrections: ${this.learningData.corrections.length}`);
    console.log(`   - Keyword weights: ${Object.keys(this.keywordWeights).length}`);
  }

  // Load data from JSON file
  loadData(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('⚠️ Error loading learning data:', err.message);
    }
    return { totalPredictions: 0, correctPredictions: 0, corrections: [], categoryHistory: {} };
  }

  // Save data to JSON file
  saveData(filePath, data) {
    try {
      this.ensureDirectoryExists(filePath);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      console.error('❌ Error saving learning data:', err.message);
      return false;
    }
  }

  // Ensure directory exists
  ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Record a prediction
  recordPrediction(title, predictedCategory, confidence) {
    this.learningData.totalPredictions++;
    
    if (!this.learningData.categoryHistory[predictedCategory]) {
      this.learningData.categoryHistory[predictedCategory] = {
        total: 0,
        titles: []
      };
    }
    
    this.learningData.categoryHistory[predictedCategory].total++;
    this.learningData.categoryHistory[predictedCategory].titles.push({
      title,
      confidence,
      timestamp: new Date().toISOString()
    });

    // Keep only last 100 titles per category
    if (this.learningData.categoryHistory[predictedCategory].titles.length > 100) {
      this.learningData.categoryHistory[predictedCategory].titles = 
        this.learningData.categoryHistory[predictedCategory].titles.slice(-100);
    }

    this.saveData(LEARNING_DATA_PATH, this.learningData);
  }

  // Record a correction (user feedback)
  recordCorrection(title, predictedCategory, correctCategory) {
    const correction = {
      title,
      predicted: predictedCategory,
      correct: correctCategory,
      timestamp: new Date().toISOString(),
      learned: false
    };

    this.learningData.corrections.push(correction);
    
    // Keep only last 500 corrections
    if (this.learningData.corrections.length > 500) {
      this.learningData.corrections = this.learningData.corrections.slice(-500);
    }

    // Learn from this correction immediately
    this.learnFromCorrection(correction);
    
    this.saveData(LEARNING_DATA_PATH, this.learningData);
    
    return { success: true, message: '✅ บันทึกการเรียนรู้แล้ว' };
  }

  // Learn from a single correction
  learnFromCorrection(correction) {
    const { title, predicted, correct } = correction;
    const keywords = this.extractKeywords(title);

    // Increase weight for keywords that should lead to correct category
    keywords.forEach(keyword => {
      const key = `${keyword}:${correct}`;
      
      if (!this.keywordWeights[key]) {
        this.keywordWeights[key] = {
          weight: 1.0,
          successes: 0,
          failures: 0
        };
      }

      // Increase weight for correct association
      this.keywordWeights[key].weight += 0.1;
      this.keywordWeights[key].successes++;

      // Decrease weight for wrong category
      const wrongKey = `${keyword}:${predicted}`;
      if (this.keywordWeights[wrongKey]) {
        this.keywordWeights[wrongKey].weight = Math.max(0.1, 
          this.keywordWeights[wrongKey].weight - 0.05);
        this.keywordWeights[wrongKey].failures++;
      }
    });

    this.saveData(KEYWORD_WEIGHTS_PATH, this.keywordWeights);
  }

  // Extract keywords from title
  extractKeywords(title) {
    if (!title) return [];
    
    // Clean and tokenize
    const cleanTitle = title.toLowerCase()
      .replace(/[^\w\s\u0E00-\u0E7F]/g, ' ') // Keep Thai and English chars
      .split(/\s+/)
      .filter(w => w.length > 1);

    // Generate n-grams (1-3 words)
    const keywords = [];
    for (let i = 0; i < cleanTitle.length; i++) {
      // 1-gram
      keywords.push(cleanTitle[i]);
      // 2-gram
      if (i + 1 < cleanTitle.length) {
        keywords.push(`${cleanTitle[i]} ${cleanTitle[i+1]}`);
      }
      // 3-gram
      if (i + 2 < cleanTitle.length) {
        keywords.push(`${cleanTitle[i]} ${cleanTitle[i+1]} ${cleanTitle[i+2]}`);
      }
    }

    return [...new Set(keywords)]; // Remove duplicates
  }

  // Get adjusted score for a keyword-category pair
  getKeywordWeight(keyword, category) {
    const key = `${keyword}:${category}`;
    return this.keywordWeights[key]?.weight || 1.0;
  }

  // Get learning statistics
  getStats() {
    const total = this.learningData.totalPredictions;
    const correct = this.learningData.correctPredictions;
    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;
    
    const unlearnedCorrections = this.learningData.corrections.filter(c => !c.learned).length;
    
    return {
      totalPredictions: total,
      correctPredictions: correct,
      accuracy: `${accuracy}%`,
      totalCorrections: this.learningData.corrections.length,
      unlearnedCorrections: unlearnedCorrections,
      keywordWeightsCount: Object.keys(this.keywordWeights).length,
      topCategories: Object.entries(this.learningData.categoryHistory)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([cat, data]) => ({ category: cat, count: data.total }))
    };
  }

  // Mark prediction as correct
  markCorrect() {
    this.learningData.correctPredictions++;
    this.saveData(LEARNING_DATA_PATH, this.learningData);
  }

  // Analyze patterns and suggest improvements
  analyzePatterns() {
    const patterns = {
      frequentlyConfused: [],
      strongKeywords: [],
      weakKeywords: []
    };

    // Find frequently confused category pairs
    const confusionMatrix = {};
    this.learningData.corrections.forEach(c => {
      const key = `${c.predicted}->${c.correct}`;
      confusionMatrix[key] = (confusionMatrix[key] || 0) + 1;
    });

    Object.entries(confusionMatrix)
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([pair, count]) => {
        const [from, to] = pair.split('->');
        patterns.frequentlyConfused.push({ from, to, count });
      });

    // Find strong and weak keywords
    Object.entries(this.keywordWeights).forEach(([key, data]) => {
      const [keyword, category] = key.split(':');
      const confidence = data.successes / (data.successes + data.failures || 1);
      
      if (data.successes >= 5 && confidence >= 0.8) {
        patterns.strongKeywords.push({ keyword, category, confidence, successes: data.successes });
      }
      
      if (data.failures >= 5 && confidence <= 0.3) {
        patterns.weakKeywords.push({ keyword, category, confidence, failures: data.failures });
      }
    });

    patterns.strongKeywords.sort((a, b) => b.confidence - a.confidence);
    patterns.weakKeywords.sort((a, b) => a.confidence - b.confidence);

    return patterns;
  }

  // Export learning data for backup
  exportLearningData() {
    return {
      learningData: this.learningData,
      keywordWeights: this.keywordWeights,
      exportedAt: new Date().toISOString()
    };
  }

  // Import learning data from backup
  importLearningData(data) {
    try {
      if (data.learningData) {
        this.learningData = { ...this.learningData, ...data.learningData };
        this.saveData(LEARNING_DATA_PATH, this.learningData);
      }
      
      if (data.keywordWeights) {
        this.keywordWeights = { ...this.keywordWeights, ...data.keywordWeights };
        this.saveData(KEYWORD_WEIGHTS_PATH, this.keywordWeights);
      }
      
      return { success: true, message: '✅ นำเข้าข้อมูลการเรียนรู้สำเร็จ' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Reset learning data
  resetLearning() {
    this.learningData = {
      totalPredictions: 0,
      correctPredictions: 0,
      corrections: [],
      categoryHistory: {}
    };
    this.keywordWeights = {};
    
    this.saveData(LEARNING_DATA_PATH, this.learningData);
    this.saveData(KEYWORD_WEIGHTS_PATH, this.keywordWeights);
    
    return { success: true, message: '🔄 รีเซ็ตข้อมูลการเรียนรู้แล้ว' };
  }
}

// Create singleton instance
const ai = new SelfEvolvingAI();

// Export for use in other modules
module.exports = {
  SelfEvolvingAI,
  ai,
  
  // Convenience functions
  recordPrediction: (title, category, confidence) => 
    ai.recordPrediction(title, category, confidence),
  
  recordCorrection: (title, predicted, correct) => 
    ai.recordCorrection(title, predicted, correct),
  
  getKeywordWeight: (keyword, category) => 
    ai.getKeywordWeight(keyword, category),
  
  getStats: () => ai.getStats(),
  markCorrect: () => ai.markCorrect(),
  analyzePatterns: () => ai.analyzePatterns(),
  exportLearningData: () => ai.exportLearningData(),
  importLearningData: (data) => ai.importLearningData(data),
  resetLearning: () => ai.resetLearning()
};
