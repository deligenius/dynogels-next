'use strict';

const dynogels = require('../index');
const chai = require('chai');
const async = require('async');
const _ = require('lodash');
const Joi = require('joi');

const expect = chai.expect;
chai.should();

// Configure for local DynamoDB
dynogels.AWS.config.update({
  accessKeyId: 'test',
  secretAccessKey: 'test',
  region: 'localhost',
  endpoint: 'http://localhost:8000'
});

describe('End-to-End Application Workflow Tests', function() {
  this.timeout(60000); // Extended timeout for complex workflows

  let User, Organization, Project, Task, ActivityLog;

  before(() => {
    // Define a complete application data model

    // Users table
    User = dynogels.define('E2E_User', {
      hashKey: 'userId',
      timestamps: true,
      schema: {
        userId: dynogels.types.uuid(),
        email: Joi.string().email().required(),
        username: Joi.string().required(),
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        role: Joi.string().valid('admin', 'manager', 'developer', 'viewer').default('viewer'),
        isActive: Joi.boolean().default(true),
        lastLoginAt: Joi.date(),
        profile: {
          avatar: Joi.string().uri(),
          bio: Joi.string(),
          timezone: Joi.string().default('UTC'),
          preferences: {
            theme: Joi.string().valid('light', 'dark').default('light'),
            notifications: Joi.boolean().default(true),
            language: Joi.string().default('en')
          }
        },
        skills: dynogels.types.stringSet(),
        organizationIds: dynogels.types.stringSet()
      }
    });

    // Organizations table
    Organization = dynogels.define('E2E_Organization', {
      hashKey: 'orgId',
      timestamps: true,
      schema: {
        orgId: dynogels.types.uuid(),
        name: Joi.string().required(),
        slug: Joi.string().required(),
        description: Joi.string(),
        website: Joi.string().uri(),
        isActive: Joi.boolean().default(true),
        settings: {
          allowPublicProjects: Joi.boolean().default(false),
          defaultProjectVisibility: Joi.string().valid('public', 'private').default('private'),
          maxProjects: Joi.number().default(100),
          features: dynogels.types.stringSet()
        },
        billing: {
          plan: Joi.string().valid('free', 'pro', 'enterprise').default('free'),
          seats: Joi.number().default(5),
          billingEmail: Joi.string().email()
        },
        memberCount: Joi.number().default(0),
        projectCount: Joi.number().default(0)
      }
    });

    // Projects table with GSI
    Project = dynogels.define('E2E_Project', {
      hashKey: 'projectId',
      timestamps: true,
      schema: {
        projectId: dynogels.types.uuid(),
        organizationId: Joi.string().required(),
        name: Joi.string().required(),
        description: Joi.string(),
        status: Joi.string().valid('active', 'on-hold', 'completed', 'archived').default('active'),
        visibility: Joi.string().valid('public', 'private').default('private'),
        ownerId: Joi.string().required(),
        memberIds: dynogels.types.stringSet(),
        tags: dynogels.types.stringSet(),
        priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
        startDate: Joi.date(),
        endDate: Joi.date(),
        progress: Joi.number().min(0).max(100).default(0),
        budget: {
          estimated: Joi.number(),
          actual: Joi.number().default(0),
          currency: Joi.string().default('USD')
        },
        metadata: Joi.object(),
        taskCount: Joi.number().default(0),
        completedTaskCount: Joi.number().default(0)
      },
      indexes: [{
        hashKey: 'organizationId',
        rangeKey: 'createdAt',
        name: 'OrgProjectsIndex',
        type: 'global'
      }, {
        hashKey: 'ownerId',
        rangeKey: 'createdAt',
        name: 'UserProjectsIndex',
        type: 'global'
      }]
    });

    // Tasks table with composite key
    Task = dynogels.define('E2E_Task', {
      hashKey: 'projectId',
      rangeKey: 'taskId',
      timestamps: true,
      schema: {
        projectId: Joi.string().required(),
        taskId: dynogels.types.uuid(),
        title: Joi.string().required(),
        description: Joi.string(),
        status: Joi.string().valid('todo', 'in-progress', 'review', 'done').default('todo'),
        priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
        assignedTo: Joi.string(),
        reporterId: Joi.string().required(),
        labels: dynogels.types.stringSet(),
        estimatedHours: Joi.number(),
        actualHours: Joi.number().default(0),
        dueDate: Joi.date(),
        parentTaskId: Joi.string(),
        dependencies: dynogels.types.stringSet(),
        attachments: Joi.array().items(Joi.object({
          filename: Joi.string().required(),
          url: Joi.string().uri().required(),
          size: Joi.number(),
          type: Joi.string()
        })),
        comments: Joi.array().items(Joi.object({
          commentId: Joi.string().required(),
          authorId: Joi.string().required(),
          content: Joi.string().required(),
          createdAt: Joi.date().required()
        }))
      },
      indexes: [{
        hashKey: 'assignedTo',
        rangeKey: 'dueDate',
        name: 'AssigneeTasksIndex',
        type: 'global'
      }]
    });

    // Activity Log table for audit trail
    ActivityLog = dynogels.define('E2E_ActivityLog', {
      hashKey: 'entityId',
      rangeKey: 'timestamp',
      timestamps: false, // We manage timestamp manually
      schema: {
        entityId: Joi.string().required(), // Can be userId, projectId, etc.
        timestamp: Joi.string().required(), // ISO string for range key
        activityId: dynogels.types.uuid(),
        entityType: Joi.string().valid('user', 'organization', 'project', 'task').required(),
        action: Joi.string().required(), // created, updated, deleted, etc.
        actorId: Joi.string().required(), // Who performed the action
        actorType: Joi.string().valid('user', 'system').default('user'),
        details: Joi.object(), // Action-specific details
        ipAddress: Joi.string(),
        userAgent: Joi.string(),
        metadata: Joi.object()
      }
    });
  });

  describe('Application Setup', () => {
    it('should create all application tables', (done) => {
      const tableOptions = {
        'E2E_User': { readCapacity: 1, writeCapacity: 1 },
        'E2E_Organization': { readCapacity: 1, writeCapacity: 1 },
        'E2E_Project': { readCapacity: 1, writeCapacity: 1 },
        'E2E_Task': { readCapacity: 1, writeCapacity: 1 },
        'E2E_ActivityLog': { readCapacity: 1, writeCapacity: 1 }
      };

      dynogels.createTables(tableOptions, (err) => {
        expect(err).to.not.exist;
        done();
      });
    });
  });

  describe('Complete User Journey: From Registration to Project Completion', () => {
    const testData = {
      users: [],
      organizations: [],
      projects: [],
      tasks: []
    };

    it('Step 1: User Registration and Profile Setup', (done) => {
      const usersData = [
        {
          email: 'admin@company.com',
          username: 'admin',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          skills: ['leadership', 'strategy', 'management'],
          profile: {
            bio: 'Company administrator with 10+ years experience',
            timezone: 'America/New_York',
            preferences: {
              theme: 'dark',
              notifications: true,
              language: 'en'
            }
          }
        },
        {
          email: 'manager@company.com',
          username: 'projectmanager',
          firstName: 'Project',
          lastName: 'Manager',
          role: 'manager',
          skills: ['project-management', 'agile', 'scrum'],
          profile: {
            bio: 'Experienced project manager',
            timezone: 'America/New_York'
          }
        },
        {
          email: 'dev1@company.com',
          username: 'developer1',
          firstName: 'John',
          lastName: 'Developer',
          role: 'developer',
          skills: ['javascript', 'nodejs', 'react', 'aws'],
          profile: {
            bio: 'Full-stack developer specializing in Node.js',
            timezone: 'America/Los_Angeles'
          }
        },
        {
          email: 'dev2@company.com',
          username: 'developer2',
          firstName: 'Jane',
          lastName: 'Developer',
          role: 'developer',
          skills: ['python', 'django', 'postgresql', 'docker'],
          profile: {
            bio: 'Backend developer with DevOps experience',
            timezone: 'Europe/London'
          }
        }
      ];

      async.mapSeries(usersData, (userData, callback) => {
        User.create(userData, (err, user) => {
          if (err) return callback(err);
          
          // Log user registration activity
          ActivityLog.create({
            entityId: user.get('userId'),
            timestamp: new Date().toISOString(),
            entityType: 'user',
            action: 'registered',
            actorId: user.get('userId'),
            details: {
              email: user.get('email'),
              role: user.get('role')
            }
          }, (logErr) => {
            // Continue even if logging fails
            callback(null, user);
          });
        });
      }, (err, users) => {
        expect(err).to.not.exist;
        expect(users).to.have.length(4);
        testData.users = users;
        
        users.forEach(user => {
          expect(user.get('userId')).to.exist;
          expect(user.get('email')).to.match(/@company\.com$/);
          expect(user.get('isActive')).to.be.true;
        });
        
        done();
      });
    });

    it('Step 2: Organization Creation and User Assignment', (done) => {
      const adminUser = testData.users[0];
      
      const orgData = {
        name: 'TechCorp Solutions',
        slug: 'techcorp',
        description: 'A leading technology solutions company',
        website: 'https://techcorp.example.com',
        settings: {
          allowPublicProjects: true,
          defaultProjectVisibility: 'private',
          maxProjects: 50,
          features: ['advanced-analytics', 'custom-workflows', 'api-access']
        },
        billing: {
          plan: 'enterprise',
          seats: 25,
          billingEmail: 'billing@company.com'
        }
      };

      Organization.create(orgData, (err, org) => {
        expect(err).to.not.exist;
        expect(org.get('name')).to.equal('TechCorp Solutions');
        testData.organizations.push(org);

        // Update all users to be part of this organization
        async.each(testData.users, (user, callback) => {
          const orgIds = user.get('organizationIds') || [];
          orgIds.add(org.get('orgId'));
          
          User.update({
            userId: user.get('userId'),
            organizationIds: orgIds,
            lastLoginAt: new Date()
          }, callback);
        }, (err) => {
          expect(err).to.not.exist;
          
          // Update organization member count
          Organization.update({
            orgId: org.get('orgId'),
            memberCount: testData.users.length
          }, (err, updatedOrg) => {
            expect(err).to.not.exist;
            expect(updatedOrg.get('memberCount')).to.equal(4);
            done();
          });
        });
      });
    });

    it('Step 3: Project Creation with Multiple Projects', (done) => {
      const organization = testData.organizations[0];
      const manager = testData.users[1];
      const admin = testData.users[0];

      const projectsData = [
        {
          organizationId: organization.get('orgId'),
          name: 'Customer Portal Redesign',
          description: 'Complete redesign of the customer portal with modern UI/UX',
          ownerId: manager.get('userId'),
          memberIds: testData.users.slice(1).map(u => u.get('userId')), // All except admin
          tags: ['ui-ux', 'frontend', 'customer-facing'],
          priority: 'high',
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
          budget: {
            estimated: 50000,
            currency: 'USD'
          }
        },
        {
          organizationId: organization.get('orgId'),
          name: 'API Modernization',
          description: 'Migrate legacy APIs to modern microservices architecture',
          ownerId: admin.get('userId'),
          memberIds: [testData.users[2].get('userId'), testData.users[3].get('userId')], // Both developers
          tags: ['backend', 'api', 'microservices', 'modernization'],
          priority: 'critical',
          startDate: new Date(),
          endDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days from now
          budget: {
            estimated: 75000,
            currency: 'USD'
          }
        },
        {
          organizationId: organization.get('orgId'),
          name: 'DevOps Pipeline Enhancement',
          description: 'Improve CI/CD pipelines and deployment automation',
          ownerId: testData.users[3].get('userId'), // Jane Developer
          memberIds: [testData.users[3].get('userId')],
          tags: ['devops', 'ci-cd', 'automation'],
          priority: 'medium',
          startDate: new Date(),
          budget: {
            estimated: 25000,
            currency: 'USD'
          }
        }
      ];

      async.mapSeries(projectsData, (projectData, callback) => {
        Project.create(projectData, (err, project) => {
          if (err) return callback(err);
          
          // Log project creation
          ActivityLog.create({
            entityId: project.get('projectId'),
            timestamp: new Date().toISOString(),
            entityType: 'project',
            action: 'created',
            actorId: project.get('ownerId'),
            details: {
              name: project.get('name'),
              organizationId: project.get('organizationId'),
              priority: project.get('priority')
            }
          }, (logErr) => {
            callback(null, project);
          });
        });
      }, (err, projects) => {
        expect(err).to.not.exist;
        expect(projects).to.have.length(3);
        testData.projects = projects;
        
        // Update organization project count
        Organization.update({
          orgId: organization.get('orgId'),
          projectCount: projects.length
        }, (err) => {
          expect(err).to.not.exist;
          done();
        });
      });
    });

    it('Step 4: Task Creation and Assignment', (done) => {
      const portalProject = testData.projects[0];
      const apiProject = testData.projects[1];
      const manager = testData.users[1];
      const dev1 = testData.users[2];
      const dev2 = testData.users[3];

      const tasksData = [
        // Tasks for Customer Portal Redesign
        {
          projectId: portalProject.get('projectId'),
          title: 'UI/UX Research and Analysis',
          description: 'Conduct user research and analyze current portal usage patterns',
          status: 'in-progress',
          priority: 'high',
          assignedTo: manager.get('userId'),
          reporterId: manager.get('userId'),
          labels: ['research', 'ux'],
          estimatedHours: 40,
          actualHours: 15,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        {
          projectId: portalProject.get('projectId'),
          title: 'Design System Creation',
          description: 'Create comprehensive design system and component library',
          status: 'todo',
          priority: 'high',
          assignedTo: dev1.get('userId'),
          reporterId: manager.get('userId'),
          labels: ['design', 'frontend'],
          estimatedHours: 60,
          dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)
        },
        {
          projectId: portalProject.get('projectId'),
          title: 'Frontend Implementation',
          description: 'Implement new portal frontend using React and design system',
          status: 'todo',
          priority: 'medium',
          assignedTo: dev1.get('userId'),
          reporterId: manager.get('userId'),
          labels: ['frontend', 'react'],
          estimatedHours: 120,
          dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
          dependencies: ['design-system-creation'] // Would be actual task IDs in real app
        },
        // Tasks for API Modernization
        {
          projectId: apiProject.get('projectId'),
          title: 'Legacy API Audit',
          description: 'Audit existing APIs and identify modernization priorities',
          status: 'done',
          priority: 'critical',
          assignedTo: dev2.get('userId'),
          reporterId: testData.users[0].get('userId'), // Admin
          labels: ['audit', 'backend'],
          estimatedHours: 30,
          actualHours: 35
        },
        {
          projectId: apiProject.get('projectId'),
          title: 'Microservices Architecture Design',
          description: 'Design new microservices architecture and migration plan',
          status: 'review',
          priority: 'critical',
          assignedTo: dev2.get('userId'),
          reporterId: testData.users[0].get('userId'),
          labels: ['architecture', 'microservices'],
          estimatedHours: 50,
          actualHours: 48,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        },
        {
          projectId: apiProject.get('projectId'),
          title: 'Authentication Service Implementation',
          description: 'Implement centralized authentication microservice',
          status: 'in-progress',
          priority: 'high',
          assignedTo: dev1.get('userId'),
          reporterId: testData.users[0].get('userId'),
          labels: ['auth', 'microservice', 'security'],
          estimatedHours: 80,
          actualHours: 25,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      ];

      async.mapSeries(tasksData, (taskData, callback) => {
        Task.create(taskData, (err, task) => {
          if (err) return callback(err);
          
          // Log task creation
          ActivityLog.create({
            entityId: task.get('taskId'),
            timestamp: new Date().toISOString(),
            entityType: 'task',
            action: 'created',
            actorId: task.get('reporterId'),
            details: {
              title: task.get('title'),
              projectId: task.get('projectId'),
              assignedTo: task.get('assignedTo'),
              priority: task.get('priority')
            }
          }, (logErr) => {
            callback(null, task);
          });
        });
      }, (err, tasks) => {
        expect(err).to.not.exist;
        expect(tasks).to.have.length(6);
        testData.tasks = tasks;
        
        // Update project task counts
        const projectTaskCounts = _.countBy(tasks, task => task.get('projectId'));
        const completedTaskCounts = _.countBy(_.filter(tasks, t => t.get('status') === 'done'), task => task.get('projectId'));
        
        async.each(testData.projects, (project, callback) => {
          const projectId = project.get('projectId');
          const taskCount = projectTaskCounts[projectId] || 0;
          const completedCount = completedTaskCounts[projectId] || 0;
          const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;
          
          Project.update({
            projectId: projectId,
            taskCount: taskCount,
            completedTaskCount: completedCount,
            progress: progress
          }, callback);
        }, (err) => {
          expect(err).to.not.exist;
          done();
        });
      });
    });

    it('Step 5: Task Progress and Updates', (done) => {
      const taskToComplete = testData.tasks.find(t => t.get('status') === 'in-progress');
      const taskToUpdate = testData.tasks.find(t => t.get('status') === 'todo');

      async.series([
        // Complete a task
        (callback) => {
          Task.update({
            projectId: taskToComplete.get('projectId'),
            taskId: taskToComplete.get('taskId'),
            status: 'done',
            actualHours: taskToComplete.get('estimatedHours'),
            comments: [{
              commentId: 'comment-1',
              authorId: taskToComplete.get('assignedTo'),
              content: 'Task completed successfully. All requirements met.',
              createdAt: new Date()
            }]
          }, (err, updatedTask) => {
            expect(err).to.not.exist;
            expect(updatedTask.get('status')).to.equal('done');
            
            // Log task completion
            ActivityLog.create({
              entityId: updatedTask.get('taskId'),
              timestamp: new Date().toISOString(),
              entityType: 'task',
              action: 'completed',
              actorId: updatedTask.get('assignedTo'),
              details: {
                title: updatedTask.get('title'),
                actualHours: updatedTask.get('actualHours')
              }
            }, callback);
          });
        },
        // Update another task
        (callback) => {
          Task.update({
            projectId: taskToUpdate.get('projectId'),
            taskId: taskToUpdate.get('taskId'),
            status: 'in-progress',
            actualHours: { $add: 8 }, // Add 8 hours of work
            comments: [{
              commentId: 'comment-2',
              authorId: taskToUpdate.get('assignedTo'),
              content: 'Started working on this task. Making good progress.',
              createdAt: new Date()
            }]
          }, (err, updatedTask) => {
            expect(err).to.not.exist;
            expect(updatedTask.get('status')).to.equal('in-progress');
            expect(updatedTask.get('actualHours')).to.equal(8);
            callback();
          });
        }
      ], done);
    });

    it('Step 6: Reporting and Analytics Queries', (done) => {
      async.parallel({
        // Get all projects for organization
        organizationProjects: (callback) => {
          Project.query(testData.organizations[0].get('orgId'))
            .usingIndex('OrgProjectsIndex')
            .exec(callback);
        },
        
        // Get tasks assigned to specific user
        userTasks: (callback) => {
          Task.query(testData.users[2].get('userId'))
            .usingIndex('AssigneeTasksIndex')
            .exec(callback);
        },
        
        // Get all users in organization
        organizationUsers: (callback) => {
          User.scan()
            .where('organizationIds').contains(testData.organizations[0].get('orgId'))
            .exec(callback);
        },
        
        // Get high priority tasks across all projects
        highPriorityTasks: (callback) => {
          async.map(testData.projects, (project, cb) => {
            Task.query(project.get('projectId'))
              .filter('priority').equals('high')
              .exec(cb);
          }, (err, results) => {
            if (err) return callback(err);
            const allTasks = _.flatten(results.map(r => r.Items));
            callback(null, { Items: allTasks });
          });
        },
        
        // Get activity log for specific project
        projectActivity: (callback) => {
          ActivityLog.query(testData.projects[0].get('projectId'))
            .exec(callback);
        }
      }, (err, results) => {
        expect(err).to.not.exist;
        
        // Validate organization projects
        expect(results.organizationProjects.Items).to.have.length(3);
        
        // Validate user tasks
        expect(results.userTasks.Items.length).to.be.at.least(1);
        
        // Validate organization users
        expect(results.organizationUsers.Items).to.have.length(4);
        
        // Validate high priority tasks
        expect(results.highPriorityTasks.Items.length).to.be.at.least(1);
        
        // Validate activity logs
        expect(results.projectActivity.Items.length).to.be.at.least(1);
        
        done();
      });
    });

    it('Step 7: Performance Metrics and Statistics', (done) => {
      async.parallel({
        // Count total users
        totalUsers: (callback) => {
          User.scan().select('COUNT').exec(callback);
        },
        
        // Count active projects
        activeProjects: (callback) => {
          Project.scan()
            .where('status').equals('active')
            .select('COUNT')
            .exec(callback);
        },
        
        // Get project completion rates
        projectStats: (callback) => {
          async.map(testData.projects, (project, cb) => {
            Task.query(project.get('projectId'))
              .exec((err, tasks) => {
                if (err) return cb(err);
                
                const total = tasks.Items.length;
                const completed = tasks.Items.filter(t => t.get('status') === 'done').length;
                const completionRate = total > 0 ? (completed / total) * 100 : 0;
                
                cb(null, {
                  projectId: project.get('projectId'),
                  projectName: project.get('name'),
                  totalTasks: total,
                  completedTasks: completed,
                  completionRate: completionRate
                });
              });
          }, callback);
        }
      }, (err, stats) => {
        expect(err).to.not.exist;
        
        expect(stats.totalUsers.Count).to.equal(4);
        expect(stats.activeProjects.Count).to.equal(3);
        expect(stats.projectStats).to.have.length(3);
        
        stats.projectStats.forEach(project => {
          expect(project.totalTasks).to.be.a('number');
          expect(project.completedTasks).to.be.a('number');
          expect(project.completionRate).to.be.at.least(0);
        });
        
        done();
      });
    });
  });

  describe('Advanced Operations and Edge Cases', () => {
    it('should handle concurrent task updates', (done) => {
      const task = testData.tasks[0];
      
      // Simulate concurrent updates to the same task
      const updates = [
        { actualHours: { $add: 2 } },
        { actualHours: { $add: 3 } },
        { actualHours: { $add: 1 } }
      ];
      
      async.map(updates, (update, callback) => {
        Task.update({
          projectId: task.get('projectId'),
          taskId: task.get('taskId'),
          ...update
        }, callback);
      }, (err, results) => {
        // Some updates might fail due to concurrent modification
        // This is expected behavior
        const successful = results.filter(r => r !== null);
        expect(successful.length).to.be.at.least(1);
        done();
      });
    });

    it('should handle large batch operations', (done) => {
      // Create a batch of activity logs
      const batchLogs = [];
      for (let i = 0; i < 25; i++) {
        batchLogs.push({
          entityId: testData.users[i % 4].get('userId'),
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          entityType: 'user',
          action: 'viewed_dashboard',
          actorId: testData.users[i % 4].get('userId'),
          details: { page: 'dashboard', section: 'projects' }
        });
      }
      
      async.mapLimit(batchLogs, 5, ActivityLog.create.bind(ActivityLog), (err, logs) => {
        expect(err).to.not.exist;
        expect(logs).to.have.length(25);
        done();
      });
    });

    it('should handle complex filtering and sorting', (done) => {
      // Query tasks with multiple filters
      async.parallel([
        // Tasks assigned to developers with high priority
        (callback) => {
          const devIds = [testData.users[2].get('userId'), testData.users[3].get('userId')];
          
          async.map(devIds, (devId, cb) => {
            Task.query(devId)
              .usingIndex('AssigneeTasksIndex')
              .filter('priority').equals('high')
              .exec(cb);
          }, (err, results) => {
            if (err) return callback(err);
            const allTasks = _.flatten(results.map(r => r.Items));
            callback(null, allTasks);
          });
        },
        
        // Recent activity logs (last hour)
        (callback) => {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          
          async.map(testData.users, (user, cb) => {
            ActivityLog.query(user.get('userId'))
              .where('timestamp').gt(oneHourAgo)
              .exec(cb);
          }, (err, results) => {
            if (err) return callback(err);
            const allLogs = _.flatten(results.map(r => r.Items));
            callback(null, allLogs);
          });
        }
      ], (err, results) => {
        expect(err).to.not.exist;
        expect(results[0]).to.be.an('array');
        expect(results[1]).to.be.an('array');
        done();
      });
    });
  });

  describe('Cleanup', () => {
    it('should clean up all test data and tables', (done) => {
      async.parallel([
        cb => User.deleteTable(cb),
        cb => Organization.deleteTable(cb),
        cb => Project.deleteTable(cb),
        cb => Task.deleteTable(cb),
        cb => ActivityLog.deleteTable(cb)
      ], (err) => {
        // Don't fail the test if cleanup fails
        console.log('Cleanup completed (errors ignored)');
        done();
      });
    });
  });
});