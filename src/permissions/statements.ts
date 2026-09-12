import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

const statement = {
    ...defaultStatements,
    persons: ['create', 'view', 'update', 'delete'],
	membershipApplications: ['create', 'view', 'update', 'delete'],
	smallGroups: ['create', 'view', 'update', 'delete'],
	smallGroupsReport: ['create', 'view', 'update', 'delete'],
};

export const accessControl = createAccessControl(statement);

export const admin = accessControl.newRole({
    ...statement,
    ...adminAc.statements, 
});

export const user = accessControl.newRole({
    ...statement,
});

export const smallGroupLeader = accessControl.newRole({
    ...statement,
    smallGroups: ['create', 'view', 'update',],
    smallGroupsReport: ['create', 'view', 'update',],
});

export const deacon = accessControl.newRole({
    ...statement,
    smallGroups: ['create', 'view', 'update', 'delete'],
	smallGroupsReport: ['create', 'view', 'update', 'delete'],
});
