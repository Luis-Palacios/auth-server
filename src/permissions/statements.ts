import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

const statement = {
    ...defaultStatements,
	membershipApplications: ['create', 'view', 'update', 'delete'],
	smallGroups: ['create', 'view', 'update', 'delete'],
	smallGroupsReport: ['create', 'view', 'update', 'delete'],
};

export const accessControl = createAccessControl(statement);

export const admin = accessControl.newRole({
    ...statement,
    ...adminAc.statements, 
});

