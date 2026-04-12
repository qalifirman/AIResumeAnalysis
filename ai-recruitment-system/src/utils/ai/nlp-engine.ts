/**
 * AI/NLP Matching Engine
 * UPDATED: Uses Asymmetric Keyword Coverage instead of strict Cosine Similarity
 * Focuses on "Does the resume have what the job needs?" rather than "Are documents identical?"
 */

// Comprehensive skill database (500+ skills across various domains)
export const SKILL_DATABASE = [
  // Programming Languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'C', 'Go', 'Rust', 'Swift',
  'Kotlin', 'Ruby', 'PHP', 'Scala', 'R', 'MATLAB', 'Perl', 'Objective-C', 'Dart', 'Elixir',
  
  // Web Development
  'React', 'Angular', 'Vue.js', 'Next.js', 'Node.js', 'Express', 'Django', 'Flask', 'FastAPI',
  'Spring Boot', 'ASP.NET', 'Laravel', 'Rails', 'HTML', 'CSS', 'Tailwind CSS', 'Bootstrap',
  'SASS', 'LESS', 'Webpack', 'Vite', 'Redux', 'MobX', 'GraphQL', 'REST API', 'WebSocket',
  
  // Mobile Development
  'React Native', 'Flutter', 'iOS Development', 'Android Development', 'SwiftUI', 'Jetpack Compose',
  'Xamarin', 'Ionic', 'Cordova',
  
  // Databases
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Cassandra', 'DynamoDB', 'Oracle',
  'Microsoft SQL Server', 'SQLite', 'Elasticsearch', 'Neo4j', 'Supabase', 'Firebase',
  
  // Cloud & DevOps
  'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab CI', 'GitHub Actions',
  'Terraform', 'Ansible', 'CircleCI', 'Travis CI', 'Heroku', 'Vercel', 'Netlify',
  
  // AI/ML
  'Machine Learning', 'Deep Learning', 'Neural Networks', 'TensorFlow', 'PyTorch', 'Keras',
  'Scikit-learn', 'NLP', 'Computer Vision', 'OpenCV', 'NLTK', 'spaCy', 'Transformers',
  'LLM', 'GPT', 'BERT', 'Data Science', 'Statistics', 'Pandas', 'NumPy', 'Matplotlib',
  
  // Data Engineering
  'ETL', 'Data Pipeline', 'Apache Spark', 'Hadoop', 'Airflow', 'Kafka', 'Data Warehouse',
  'BigQuery', 'Snowflake', 'Databricks', 'dbt',
  
  // Testing
  'Jest', 'Mocha', 'Cypress', 'Selenium', 'Playwright', 'JUnit', 'PyTest', 'Unit Testing',
  'Integration Testing', 'E2E Testing', 'Test Automation', 'TDD', 'BDD',
  
  // Tools & Methodologies
  'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Agile', 'Scrum', 'Kanban', 'Jira', 'Confluence',
  'Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'CI/CD', 'Microservices',
  
  // Security
  'Cybersecurity', 'Penetration Testing', 'Ethical Hacking', 'OAuth', 'JWT', 'Encryption',
  'SSL/TLS', 'OWASP', 'Security Auditing',
  
  // Business & Analytics
  'Business Analysis', 'Product Management', 'Project Management', 'Data Analysis',
  'Tableau', 'Power BI', 'Google Analytics', 'Excel', 'Financial Analysis', 'Forecasting',
  
  // Soft Skills
  'Leadership', 'Communication', 'Teamwork', 'Problem Solving', 'Critical Thinking',
  'Collaboration', 'Time Management', 'Presentation', 'Mentoring', 'Strategic Planning',
  
  // Design
  'UI/UX Design', 'Graphic Design', 'Web Design', 'Mobile Design', 'Prototyping',
  'Wireframing', 'User Research', 'Usability Testing', 'Design Systems', 'Responsive Design',
  
  // Marketing & Sales
  'Digital Marketing', 'SEO', 'SEM', 'Content Marketing', 'Social Media Marketing',
  'Email Marketing', 'Sales', 'CRM', 'Salesforce', 'HubSpot',
  
  // Blockchain & Web3
  'Blockchain', 'Ethereum', 'Solidity', 'Smart Contracts', 'Web3', 'DeFi', 'NFT',
  
  // Game Development
  'Unity', 'Unreal Engine', 'Game Design', '3D Modeling', 'Blender', 'Maya',
  
  // Networking
  'TCP/IP', 'DNS', 'Network Security', 'VPN', 'Load Balancing', 'CDN',
  
  // Other Technical
  'API Development', 'Microservices Architecture', 'System Design', 'Distributed Systems',
  'Scalability', 'Performance Optimization', 'Code Review', 'Technical Writing',
  'Documentation', 'Debugging', 'Refactoring', 'Design Patterns', 'OOP', 'Functional Programming',
  
  // Industry-Specific
  'Healthcare IT', 'FinTech', 'E-commerce', 'EdTech', 'IoT', 'AR/VR', 'Embedded Systems',
  'Robotics', 'Automotive', 'Telecommunications', 'Retail', 'Manufacturing',
  
  // Certifications & Frameworks
  'PMP', 'CISSP', 'CEH', 'CCNA', 'CompTIA', 'Six Sigma', 'ITIL', 'ISO 27001',
  
  // Additional Technical Skills
  'Linux', 'Unix', 'Shell Scripting', 'Bash', 'PowerShell', 'VBA', 'SAP', 'ERP',
  'Salesforce', 'ServiceNow', 'Workday', 'Oracle EBS',
  
  // Emerging Technologies
  'Quantum Computing', 'Edge Computing', '5G', 'Automation', 'RPA', 'Low-Code', 'No-Code'
];

/**
 * Preprocess text for NLP analysis
 * UPDATED: Expanded stop words list to remove resume noise
 */
export function preprocessText(text: string): string[] {
  if (!text) return [];
  
  // Convert to lowercase, remove special characters, split into words
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s.#+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = normalized.split(' ');
  
  // EXPANDED Stop words list (Common resume/job words that don't add value)
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
    'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'this',
    'that', 'these', 'those', 'am', 'as', 'than', 'so', 'very', 'just', 'too',
    'also', 'like', 'use', 'using', 'used', 'work', 'worked', 'working', 
    'experience', 'experienced', 'year', 'years', 'month', 'months', 'knowledge',
    'proficient', 'proficiency', 'skill', 'skills', 'ability', 'responsible',
    'responsibility', 'responsibilities', 'role', 'team', 'member', 'project',
    'projects', 'application', 'applications', 'various', 'including', 'etc',
    'good', 'excellent', 'strong', 'proven', 'track', 'record', 'successful',
    'successfully', 'demonstrated', 'familiar', 'familiarity'
  ]);
  
  return words.filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Extract skills from text using the comprehensive skill database
 */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  
  const normalizedText = text.toLowerCase();
  const foundSkills = new Set<string>();
  
  // Multi-word skill matching (match longer phrases first)
  const sortedSkills = [...SKILL_DATABASE].sort((a, b) => b.length - a.length);
  
  for (const skill of sortedSkills) {
    const normalizedSkill = skill.toLowerCase();
    
    // Check for exact match with word boundaries to avoid partial matches
    // e.g., avoid matching "Java" inside "JavaScript"
    const regex = new RegExp(`\\b${normalizedSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(normalizedText)) {
      foundSkills.add(skill);
    }
  }
  
  return Array.from(foundSkills);
}

/**
 * NEW: Calculate Asymmetric Keyword Coverage
 * Instead of checking if documents are "similar" (Cosine),
 * this checks "How many of the Job's important words are in the Resume?"
 */
function calculateCoverageScore(resumeWords: string[], jobWords: string[]): number {
  if (jobWords.length === 0) return 0;

  // 1. Identify "Important" Job Words (Unique words in job desc)
  const jobUniqueWords = new Set(jobWords);
  
  // 2. Check overlap
  const resumeUniqueWords = new Set(resumeWords);
  let matchCount = 0;
  
  jobUniqueWords.forEach(word => {
    if (resumeUniqueWords.has(word)) {
      matchCount++;
    }
  });

  // 3. Calculate Percentage
  return matchCount / jobUniqueWords.size;
}

/**
 * Calculate skill match percentage
 * FIXED: Returns 0 if no skills required, instead of 1.
 */
function calculateSkillMatch(resumeSkills: string[], requiredSkills: string[]): number {
  // FIX: If no requirements, we cannot assume 100% match.
  // We assume 0% match and let the Text Similarity score handle the rest.
  if (!requiredSkills || requiredSkills.length === 0) return 0;
  
  const normalizedResumeSkills = resumeSkills.map(s => s.toLowerCase());
  const normalizedRequiredSkills = requiredSkills.map(s => s.toLowerCase());
  
  let matchCount = 0;
  
  for (const reqSkill of normalizedRequiredSkills) {
    if (normalizedResumeSkills.includes(reqSkill)) {
      matchCount++;
    }
  }
  
  return matchCount / requiredSkills.length;
}

/**
 * Calculate experience relevance score
 * UPDATED: Slightly relaxed thresholds
 */
function calculateExperienceScore(resumeYears: number, requiredYears: number): number {
  if (!requiredYears || requiredYears === 0) return 1;
  
  if (resumeYears >= requiredYears) {
    return 1; // Perfect match
  } else if (resumeYears >= requiredYears * 0.5) {
    return 0.8; // Relaxed
  } else if (resumeYears >= 1) {
    return 0.5; // Has some experience
  } else {
    return 0.2; // Too junior
  }
}

/**
 * Main matching function
 */
export interface MatchResult {
  matchScore: number;
  textSimilarity: number;
  skillMatch: number;
  experienceScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchedKeywords: string[];
  explanation: string;
}

export function calculateMatch(
  resumeText: string,
  jobDescription: string,
  resumeSkills: string[],
  requiredSkills: string[],
  resumeYearsExp: number,
  requiredYearsExp: number
): MatchResult {
  // Preprocess texts
  const resumeWords = preprocessText(resumeText);
  const jobWords = preprocessText(jobDescription);
  
  // --- FIXED: If requiredSkills is empty, try to auto-extract from Job Description ---
  // This prevents "Doctor" jobs (with no tags) from matching 100% with IT resumes.
  let effectiveRequiredSkills = requiredSkills || [];
  if (effectiveRequiredSkills.length === 0) {
    effectiveRequiredSkills = extractSkills(jobDescription);
  }
  
  // 1. Text Coverage (Content Match)
  const coverageScore = calculateCoverageScore(resumeWords, jobWords);
  
  // 2. Skill Match (Using the extracted skills if needed)
  const skillMatch = calculateSkillMatch(resumeSkills, effectiveRequiredSkills);
  
  // 3. Experience Score
  let experienceScore = calculateExperienceScore(resumeYearsExp, requiredYearsExp);
  
  // Find matched and missing skills
  const normalizedResumeSkills = resumeSkills.map(s => s.toLowerCase());
  
  const matchedSkills = effectiveRequiredSkills.filter(skill =>
    normalizedResumeSkills.includes(skill.toLowerCase())
  );
  
  const missingSkills = effectiveRequiredSkills.filter(skill =>
    !normalizedResumeSkills.includes(skill.toLowerCase())
  );
  
  // Find matched keywords for display
  const resumeSet = new Set(resumeWords);
  const jobSet = new Set(jobWords);
  const matchedKeywords = [...jobSet].filter(word => resumeSet.has(word));

  // === Logic Kill Switch (Stricter) ===
  
  let penaltyApplied = false;
  // If skills were found/required, but candidate matches very few
  const skillThreshold = 0.20; 
  
  // If we have requirements (either tagged or extracted), and match is low...
  if (effectiveRequiredSkills.length > 0 && skillMatch < skillThreshold) {
    penaltyApplied = true;
    
    // 1. Remove Experience Score completely (Years of coding don't count for unrelated job)
    experienceScore = 0; 
  }
  
  // 4. Weighted Final Score
  // Skills: 50%, Content: 30%, Experience: 20%
  let matchScore = (coverageScore * 0.30) + (skillMatch * 0.50) + (experienceScore * 0.20);
  
  // Apply final Crush if penalty was triggered
  if (penaltyApplied) {
    // Cap the score at 20% max, prevents recommendation
    matchScore = Math.min(matchScore, 0.20);
  }
  
  // Generate explanation
  let explanation = generateExplanation(
    matchScore,
    skillMatch,
    matchedSkills,
    missingSkills,
    experienceScore,
    resumeYearsExp,
    requiredYearsExp
  );
  
  if (penaltyApplied) {
    explanation = `Low skill match (${Math.round(skillMatch*100)}%). Experience ignored due to skill mismatch. ` + explanation;
  }
  
  return {
    matchScore: Math.round(matchScore * 100) / 100,
    textSimilarity: Math.round(coverageScore * 100) / 100,
    skillMatch: Math.round(skillMatch * 100) / 100,
    experienceScore: Math.round(experienceScore * 100) / 100,
    matchedSkills,
    missingSkills,
    matchedKeywords: matchedKeywords.slice(0, 10),
    explanation
  };
}

/**
 * Generate human-readable explanation
 */
function generateExplanation(
  matchScore: number,
  skillMatch: number,
  matchedSkills: string[],
  missingSkills: string[],
  experienceScore: number,
  resumeYears: number,
  requiredYears: number
): string {
  const percentage = Math.round(matchScore * 100);
  
  let explanation = `Overall match: ${percentage}%. `;
  
  // Skill analysis
  if (skillMatch >= 0.8) {
    explanation += `Strong skill match (${Math.round(skillMatch * 100)}%). `;
  } else if (skillMatch >= 0.5) {
    explanation += `Good skill match (${Math.round(skillMatch * 100)}%). `;
  } else {
    explanation += `Partial skill match (${Math.round(skillMatch * 100)}%). `;
  }
  
  // Experience analysis
  if (experienceScore >= 0.8) {
    explanation += `Experience requirement met.`;
  } else if (experienceScore > 0) {
    explanation += `Experience considered.`;
  } else {
    explanation += `Experience mismatch or ignored.`;
  }
  
  return explanation;
}

/**
 * Parse resume text (Unchanged)
 */
export interface ParsedResume {
  skills: string[];
  yearsOfExperience: number;
  education: string[];
  rawText: string;
}

export function parseResume(resumeText: string): ParsedResume {
  const skills = extractSkills(resumeText);
  
  let yearsOfExperience = 0;
  const yearMatches = resumeText.match(/(\d+)\+?\s*(years?|yrs?)\s*(of\s*)?(experience|exp)/gi);
  if (yearMatches) {
    const years = yearMatches.map(match => {
      const num = match.match(/\d+/);
      return num ? parseInt(num[0]) : 0;
    });
    yearsOfExperience = Math.max(...years);
  }
  
  if (yearsOfExperience === 0) {
    const dateRanges = resumeText.match(/(\d{4})\s*-\s*(\d{4}|present|current)/gi);
    if (dateRanges) {
      let totalYears = 0;
      const currentYear = new Date().getFullYear();
      
      for (const range of dateRanges) {
        const years = range.match(/\d{4}/g);
        if (years && years.length >= 1) {
          const startYear = parseInt(years[0]);
          const endYear = years[1] ? parseInt(years[1]) : currentYear;
          totalYears += Math.max(0, endYear - startYear);
        }
      }
      yearsOfExperience = totalYears;
    }
  }
  
  const education: string[] = [];
  const educationKeywords = ['bachelor', 'master', 'phd', 'doctorate', 'diploma', 'degree', 'b.s.', 'm.s.', 'b.a.', 'm.a.', 'mba'];
  const lines = resumeText.split('\n');
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (educationKeywords.some(keyword => lowerLine.includes(keyword))) {
      education.push(line.trim());
    }
  }
  
  return {
    skills,
    yearsOfExperience,
    education: education.slice(0, 5),
    rawText: resumeText
  };
}