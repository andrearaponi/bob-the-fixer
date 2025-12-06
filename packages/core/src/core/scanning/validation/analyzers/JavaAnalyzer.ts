/**
 * JavaAnalyzer - Analyzer for Java projects (Maven and Gradle)
 * Detects Java-specific properties for SonarQube scanning
 */

import * as path from 'path';
import { BaseAnalyzer } from './BaseAnalyzer.js';
import { DetectedProperty, ValidationWarning, ModuleInfo } from '../../../../shared/types/index.js';

export class JavaAnalyzer extends BaseAnalyzer {
  readonly language = 'java';

  getCriticalProperties(): string[] {
    return [
      'sonar.sources',
      'sonar.java.binaries'
    ];
  }

  getRecommendedProperties(): string[] {
    return [
      'sonar.tests',
      'sonar.java.libraries',
      'sonar.java.source',
      'sonar.java.test.binaries',
      'sonar.coverage.jacoco.xmlReportPaths'
    ];
  }

  protected async detectLanguage(projectPath: string): Promise<boolean> {
    // Check for Maven
    if (await this.fileExists(path.join(projectPath, 'pom.xml'))) {
      return true;
    }

    // Check for Gradle
    if (await this.fileExists(path.join(projectPath, 'build.gradle'))) {
      return true;
    }

    // Check for Gradle Kotlin DSL
    if (await this.fileExists(path.join(projectPath, 'build.gradle.kts'))) {
      return true;
    }

    return false;
  }

  protected async analyzeLanguage(projectPath: string): Promise<{
    properties: DetectedProperty[];
    warnings: ValidationWarning[];
    version?: string;
    buildTool?: string;
    modules?: ModuleInfo[];
  }> {
    const properties: DetectedProperty[] = [];
    const warnings: ValidationWarning[] = [];
    let version: string | undefined;
    let buildTool: string | undefined;
    const modules: ModuleInfo[] = [];

    // Detect build tool
    const isMaven = await this.fileExists(path.join(projectPath, 'pom.xml'));
    const isGradle = await this.fileExists(path.join(projectPath, 'build.gradle')) ||
                     await this.fileExists(path.join(projectPath, 'build.gradle.kts'));

    if (isMaven) {
      buildTool = 'maven';
      const mavenResult = await this.analyzeMavenProject(projectPath);
      properties.push(...mavenResult.properties);
      warnings.push(...mavenResult.warnings);
      version = mavenResult.version;
      modules.push(...mavenResult.modules);
    } else if (isGradle) {
      buildTool = 'gradle';
      const gradleResult = await this.analyzeGradleProject(projectPath);
      properties.push(...gradleResult.properties);
      warnings.push(...gradleResult.warnings);
      version = gradleResult.version;
      modules.push(...gradleResult.modules);
    }

    // Detect coverage reports
    const coverageProps = await this.detectCoverageReports(projectPath, buildTool);
    properties.push(...coverageProps);

    return { properties, warnings, version, buildTool, modules };
  }

  private async analyzeMavenProject(projectPath: string): Promise<{
    properties: DetectedProperty[];
    warnings: ValidationWarning[];
    version?: string;
    modules: ModuleInfo[];
  }> {
    const properties: DetectedProperty[] = [];
    const warnings: ValidationWarning[] = [];
    const modules: ModuleInfo[] = [];
    let version: string | undefined;

    // Read pom.xml
    const pomContent = await this.readFile(path.join(projectPath, 'pom.xml'));

    // Detect Java version
    if (pomContent) {
      version = this.extractMavenJavaVersion(pomContent);
      if (version) {
        properties.push(this.createProperty(
          'sonar.java.source',
          version,
          'high',
          'detected from pom.xml maven.compiler.source'
        ));
      }
    }

    // Detect sources
    const sourcesPath = 'src/main/java';
    if (await this.fileExists(path.join(projectPath, sourcesPath))) {
      properties.push(this.createProperty(
        'sonar.sources',
        sourcesPath,
        'high',
        'Maven standard layout'
      ));
    }

    // Detect tests
    const testsPath = 'src/test/java';
    if (await this.fileExists(path.join(projectPath, testsPath))) {
      properties.push(this.createProperty(
        'sonar.tests',
        testsPath,
        'high',
        'Maven standard layout'
      ));
    }

    // Detect binaries
    const binariesPath = 'target/classes';
    if (await this.fileExists(path.join(projectPath, binariesPath))) {
      properties.push(this.createProperty(
        'sonar.java.binaries',
        binariesPath,
        'high',
        'Maven target/classes directory'
      ));
    } else {
      warnings.push(this.createWarning(
        'JAVA-WARN-001',
        'warning',
        'No compiled classes found in target/classes',
        'Run "mvn compile" before scanning'
      ));
    }

    // Detect test binaries
    const testBinariesPath = 'target/test-classes';
    if (await this.fileExists(path.join(projectPath, testBinariesPath))) {
      properties.push(this.createProperty(
        'sonar.java.test.binaries',
        testBinariesPath,
        'high',
        'Maven target/test-classes directory'
      ));
    }

    // Detect modules
    if (pomContent) {
      const detectedModules = this.extractMavenModules(pomContent);
      for (const moduleName of detectedModules) {
        modules.push({
          name: moduleName,
          relativePath: moduleName,
          language: ['java'],
          sourcesDirs: [`${moduleName}/src/main/java`],
          testsDirs: [`${moduleName}/src/test/java`],
          binaryDirs: [`${moduleName}/target/classes`],
          buildFile: `${moduleName}/pom.xml`,
          buildTool: 'maven'
        });
      }
    }

    // Attempt to resolve libraries
    const librariesResult = await this.resolveMavenLibraries(projectPath);
    if (librariesResult.value) {
      properties.push(this.createProperty(
        'sonar.java.libraries',
        librariesResult.value,
        librariesResult.confidence,
        librariesResult.source
      ));
    }
    if (librariesResult.warning) {
      warnings.push(librariesResult.warning);
    }

    return { properties, warnings, version, modules };
  }

  private async analyzeGradleProject(projectPath: string): Promise<{
    properties: DetectedProperty[];
    warnings: ValidationWarning[];
    version?: string;
    modules: ModuleInfo[];
  }> {
    const properties: DetectedProperty[] = [];
    const warnings: ValidationWarning[] = [];
    const modules: ModuleInfo[] = [];
    let version: string | undefined;

    // Read build.gradle or build.gradle.kts
    let gradleContent = await this.readFile(path.join(projectPath, 'build.gradle'));
    if (!gradleContent) {
      gradleContent = await this.readFile(path.join(projectPath, 'build.gradle.kts'));
    }

    // Detect Java version
    if (gradleContent) {
      version = this.extractGradleJavaVersion(gradleContent);
      if (version) {
        properties.push(this.createProperty(
          'sonar.java.source',
          version,
          'high',
          'detected from build.gradle sourceCompatibility'
        ));
      }
    }

    // Detect sources
    const sourcesPath = 'src/main/java';
    if (await this.fileExists(path.join(projectPath, sourcesPath))) {
      properties.push(this.createProperty(
        'sonar.sources',
        sourcesPath,
        'high',
        'Gradle standard layout'
      ));
    }

    // Detect tests
    const testsPath = 'src/test/java';
    if (await this.fileExists(path.join(projectPath, testsPath))) {
      properties.push(this.createProperty(
        'sonar.tests',
        testsPath,
        'high',
        'Gradle standard layout'
      ));
    }

    // Detect binaries
    const binariesPath = 'build/classes/java/main';
    if (await this.fileExists(path.join(projectPath, binariesPath))) {
      properties.push(this.createProperty(
        'sonar.java.binaries',
        binariesPath,
        'high',
        'Gradle build/classes/java/main directory'
      ));
    } else {
      // Try alternative Kotlin path
      const kotlinBinariesPath = 'build/classes/kotlin/main';
      if (await this.fileExists(path.join(projectPath, kotlinBinariesPath))) {
        properties.push(this.createProperty(
          'sonar.java.binaries',
          kotlinBinariesPath,
          'high',
          'Gradle build/classes/kotlin/main directory'
        ));
      } else {
        warnings.push(this.createWarning(
          'JAVA-WARN-001',
          'warning',
          'No compiled classes found in build/classes',
          'Run "gradle build" or "./gradlew build" before scanning'
        ));
      }
    }

    // Detect test binaries
    const testBinariesPath = 'build/classes/java/test';
    if (await this.fileExists(path.join(projectPath, testBinariesPath))) {
      properties.push(this.createProperty(
        'sonar.java.test.binaries',
        testBinariesPath,
        'high',
        'Gradle build/classes/java/test directory'
      ));
    }

    // Detect modules from settings.gradle
    const settingsContent = await this.readFile(path.join(projectPath, 'settings.gradle'));
    if (settingsContent) {
      const detectedModules = this.extractGradleModules(settingsContent);
      for (const moduleName of detectedModules) {
        modules.push({
          name: moduleName,
          relativePath: moduleName,
          language: ['java'],
          sourcesDirs: [`${moduleName}/src/main/java`],
          testsDirs: [`${moduleName}/src/test/java`],
          binaryDirs: [`${moduleName}/build/classes/java/main`],
          buildFile: `${moduleName}/build.gradle`,
          buildTool: 'gradle'
        });
      }
    }

    // Attempt to resolve libraries
    const librariesResult = await this.resolveGradleLibraries(projectPath);
    if (librariesResult.value) {
      properties.push(this.createProperty(
        'sonar.java.libraries',
        librariesResult.value,
        librariesResult.confidence,
        librariesResult.source
      ));
    }
    if (librariesResult.warning) {
      warnings.push(librariesResult.warning);
    }

    return { properties, warnings, version, modules };
  }

  private extractMavenJavaVersion(pomContent: string): string | undefined {
    // Try maven.compiler.source
    const sourceMatch = /<maven\.compiler\.source>(\d+(?:\.\d+)?)<\/maven\.compiler\.source>/.exec(pomContent);
    if (sourceMatch) {
      return sourceMatch[1];
    }

    // Try maven.compiler.target
    const targetMatch = /<maven\.compiler\.target>(\d+(?:\.\d+)?)<\/maven\.compiler\.target>/.exec(pomContent);
    if (targetMatch) {
      return targetMatch[1];
    }

    // Try java.version property
    const javaVersionMatch = /<java\.version>(\d+(?:\.\d+)?)<\/java\.version>/.exec(pomContent);
    if (javaVersionMatch) {
      return javaVersionMatch[1];
    }

    return undefined;
  }

  private extractGradleJavaVersion(gradleContent: string): string | undefined {
    // Try sourceCompatibility
    const sourceMatch = /sourceCompatibility\s*=\s*['"]?(\d+(?:\.\d+)?)['"]?/.exec(gradleContent);
    if (sourceMatch) {
      return sourceMatch[1];
    }

    // Try JavaVersion enum
    const javaVersionMatch = /JavaVersion\.VERSION_(\d+)/.exec(gradleContent);
    if (javaVersionMatch) {
      return javaVersionMatch[1];
    }

    // Try toolchain
    const toolchainMatch = /languageVersion\.set\(JavaLanguageVersion\.of\((\d+)\)\)/.exec(gradleContent);
    if (toolchainMatch) {
      return toolchainMatch[1];
    }

    return undefined;
  }

  private extractMavenModules(pomContent: string): string[] {
    const modules: string[] = [];
    const modulesMatch = /<modules>([\s\S]*?)<\/modules>/.exec(pomContent);

    if (modulesMatch) {
      const moduleMatches = modulesMatch[1].matchAll(/<module>([^<]+)<\/module>/g);
      for (const match of moduleMatches) {
        modules.push(match[1].trim());
      }
    }

    return modules;
  }

  private extractGradleModules(settingsContent: string): string[] {
    const modules: string[] = [];

    // Match include 'module' or include('module') or include(':module')
    const includeMatches = settingsContent.matchAll(/include\s*\(?['"]([^'"]+)['"]\)?/g);
    for (const match of includeMatches) {
      const moduleName = match[1].replace(/^:/, ''); // Remove leading colon
      modules.push(moduleName);
    }

    return modules;
  }

  private async resolveMavenLibraries(projectPath: string): Promise<{
    value?: string;
    confidence: 'high' | 'medium' | 'low';
    source: string;
    warning?: ValidationWarning;
  }> {
    // Try to run mvn dependency:build-classpath
    const result = await this.execCommand(
      'mvn dependency:build-classpath -DincludeScope=compile -q',
      projectPath,
      30000 // 30s timeout
    );

    if (result?.stdout) {
      // Parse classpath from output
      const lines = result.stdout.split('\n').filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (trimmed.startsWith('[')) return false; // Maven log lines
        if (trimmed.includes('://')) return false; // URLs
        if (!trimmed.includes('.jar')) return false;
        return true;
      });

      if (lines.length > 0) {
        const classpath = lines.join('').split(path.delimiter).filter(p => p.includes('.jar'));
        if (classpath.length > 0) {
          return {
            value: classpath.join(','),
            confidence: 'high',
            source: `resolved ${classpath.length} JARs via mvn dependency:build-classpath`
          };
        }
      }
    }

    // Fallback: scan .m2 repository based on pom dependencies
    const m2Path = path.join(process.env.HOME || '~', '.m2', 'repository');
    if (await this.fileExists(m2Path)) {
      return {
        value: undefined,
        confidence: 'low',
        source: 'maven command failed',
        warning: this.createWarning(
          'JAVA-WARN-002',
          'warning',
          'Could not resolve Maven dependencies via command',
          'Run "mvn dependency:resolve" to download dependencies'
        )
      };
    }

    return {
      value: undefined,
      confidence: 'low',
      source: 'no libraries resolved'
    };
  }

  private async resolveGradleLibraries(projectPath: string): Promise<{
    value?: string;
    confidence: 'high' | 'medium' | 'low';
    source: string;
    warning?: ValidationWarning;
  }> {
    // Determine gradle command
    const useWrapper = await this.fileExists(path.join(projectPath, 'gradlew'));
    const gradleCmd = useWrapper ? './gradlew' : 'gradle';

    // Try to get dependencies
    const result = await this.execCommand(
      `${gradleCmd} dependencies --configuration compileClasspath -q`,
      projectPath,
      30000
    );

    if (result?.stdout) {
      // For Gradle, we need to find the actual JAR files
      // This is a simplified approach - in production we'd parse the dependency tree
      const gradleCachePath = path.join(process.env.HOME || '~', '.gradle', 'caches', 'modules-2', 'files-2.1');
      if (await this.fileExists(gradleCachePath)) {
        return {
          value: undefined,
          confidence: 'low',
          source: 'gradle dependencies listed but JAR paths not resolved',
          warning: this.createWarning(
            'JAVA-WARN-003',
            'info',
            'Gradle dependencies detected but not fully resolved',
            'Libraries will be resolved from Gradle cache'
          )
        };
      }
    }

    return {
      value: undefined,
      confidence: 'low',
      source: 'no libraries resolved',
      warning: this.createWarning(
        'JAVA-WARN-002',
        'warning',
        'Could not resolve Gradle dependencies',
        'Run "./gradlew build" to download dependencies'
      )
    };
  }

  private async detectCoverageReports(
    projectPath: string,
    buildTool?: string
  ): Promise<DetectedProperty[]> {
    const properties: DetectedProperty[] = [];

    // All common JaCoCo paths to check
    const jacocoPaths = [
      // Maven paths
      'target/site/jacoco/jacoco.xml',
      'target/jacoco-report/jacoco.xml',
      'target/jacoco/jacoco.xml',
      // Gradle paths
      'build/reports/jacoco/test/jacocoTestReport.xml',
      'build/reports/jacoco/jacocoTestReport.xml',
      'build/jacoco/test.xml'
    ];

    const foundPaths: string[] = [];
    for (const jacocoPath of jacocoPaths) {
      if (await this.fileExists(path.join(projectPath, jacocoPath))) {
        foundPaths.push(jacocoPath);
      }
    }

    if (foundPaths.length > 0) {
      properties.push(this.createProperty(
        'sonar.coverage.jacoco.xmlReportPaths',
        foundPaths.join(','),
        'high',
        `detected JaCoCo reports: ${foundPaths.join(', ')}`
      ));
    }

    return properties;
  }
}
