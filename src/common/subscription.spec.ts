import { isTrialPropertyCapped, isOwnerEntitled } from './subscription';
import { SUBSCRIPTION_STATUS } from './constants';

describe('isTrialPropertyCapped', () => {
  it('caps a trial owner without a plan', () => {
    // Arrange
    const owner = {
      kycBypass: false,
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
      subscriptionPlanId: null,
    };

    // Act + Assert
    expect(isTrialPropertyCapped(owner)).toBe(true);
  });

  it('does not cap once the owner has bought a plan', () => {
    const owner = {
      kycBypass: false,
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
      subscriptionPlanId: 'rooms_5',
    };

    expect(isTrialPropertyCapped(owner)).toBe(false);
  });

  it('does not cap an ADMIN-granted kycBypass owner', () => {
    const owner = {
      kycBypass: true,
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
      subscriptionPlanId: null,
    };

    expect(isTrialPropertyCapped(owner)).toBe(false);
  });

  it('does not cap an active subscriber', () => {
    const owner = {
      kycBypass: false,
      subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
      subscriptionPlanId: 'rooms_5',
    };

    expect(isTrialPropertyCapped(owner)).toBe(false);
  });

  it('does not cap a status=none owner (no active trial)', () => {
    const owner = {
      kycBypass: false,
      subscriptionStatus: SUBSCRIPTION_STATUS.NONE,
      subscriptionPlanId: null,
    };

    expect(isTrialPropertyCapped(owner)).toBe(false);
  });
});

describe('isOwnerEntitled', () => {
  it('entitles a trial owner whose trial is still valid', () => {
    const now = new Date('2026-07-09T00:00:00Z');
    const owner = {
      kycBypass: false,
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
      trialEndsAt: new Date('2026-07-20T00:00:00Z'),
    };

    expect(isOwnerEntitled(owner, now)).toBe(true);
  });

  it('locks a trial owner whose trial has expired', () => {
    const now = new Date('2026-07-09T00:00:00Z');
    const owner = {
      kycBypass: false,
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
      trialEndsAt: new Date('2026-07-01T00:00:00Z'),
    };

    expect(isOwnerEntitled(owner, now)).toBe(false);
  });
});
